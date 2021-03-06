(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (factory((global.uploader = global.uploader || {})));
}(this, function (exports) { 'use strict';

    function noop() {}

    /**
     * 合并对象
     */
    function merge(dest, src) {
        var r = {};
        for (var i in dest) {
            if (dest.hasOwnProperty(i)) {
                r[i] = dest[i];
            }
        }
        for (var i in src) {
            if (src.hasOwnProperty(i)) {
                r[i] = src[i];
            }
        }
        return r;
    }

    /**
     * 兼容低版本ie和现代浏览器的事件绑定方法
     * @param {Element|ElementArray} el 目标元素
     * @param {String} type 事件名称
     * @param {Function} fn 事件处理函数
     */
    function addEvent(el, type, fn) {
        (function() {
            if (document.addEventListener) {
                return function(el, type, fn) {
                    if (el.length) {
                        for (var i = 0; i < el.length; i++) {
                            addEvent(el[i], type, fn);
                        }
                    } else {
                        el.addEventListener(type, fn, false);
                    }
                };
            } else {
                return function(el, type, fn) {
                    if (el.length) {
                        for (var i = 0; i < el.length; i++) {
                            addEvent(el[i], type, fn);
                        }
                    } else {
                        el.attachEvent('on' + type, function() {
                            return fn.call(el, window.event);
                        });
                    }
                };
            }
        })()(el, type, fn);
    }

    /**
     * 生成不重复id
     */
    var id = 0;
    function genId() {
        return id++;
    }

    /**
     * 遍历方法
     * @param {Array} arr 
     * @param {Function} handler 
     */
    function forEach(arr, handler) {
        for (var i = 0; i < arr.length; i++) {
            var signal = handler(arr[i], i);
            if (signal !== undefined) {
                if (signal) {
                    continue;
                } else {
                    break;
                }
            }
        }
    }

    /**
     * 是否支持FormData
     */
    function isSupportFormData() {
        return !!window.FormData;
    }

    function NginHtml5(opts) {
        this.getFiles = function (e) {
    		// 获取文件列表对象
    		var files = e.target.files || e.dataTransfer.files;
            files = Array.prototype.slice.call(files);
            // 过滤文件
            files = opts.filter(files);
            // 设置唯一索引
            forEach(files, function (file) {
                file.index = genId();
            });
    		//继续添加文件
    		opts.fileList = opts.fileList.concat(files);
            //执行选择回调
    		opts.onSelect(files, opts.fileList);
    		return this;
        }
        this.deleteFile = function(fileDelete) {
            var index = opts.fileList.indexOf(fileDelete);
            if (!~index) {
                return this;
            }
            opts.fileList.splice(index, 1);
    		return this;
        }
        this.uploadFiles = function(e) {
            var self = this;
    		forEach(opts.fileList, function (file, i) {
                var data = new FormData();
                for (var j in opts.data) {
                    if (opts.data.hasOwnProperty(j)) {
                        data.append(j, opts.data[j]);
                    }
                }
                data.append('file', file);
                var xhr = new XMLHttpRequest();
                xhr.onload = function() {
                    var result;
                    if (xhr.status < 200 || xhr.status >= 300) {
                        return opts.onFailure(file, new Error('cannot post ' + opts.url + ' ' + xhr.status));
                    }
                    result = xhr.responseText || xhr.response;
                    if (opts.dataType == 'json' && result) {
                        result = JSON.parse(result);
                    }
                    opts.onSuccess(file, result);
                    self.deleteFile(file);
                    opts.onFinish(file);
                    if (!opts.fileList.length) {
                        //全部完毕
                        opts.onComplete();
                    }
                }
                xhr.onerror = function (e) {
                    opts.onFailure(file, e);
                    opts.onFinish(file);
                }
                xhr.upload.onprogress = function (e) {
                    opts.onProgress(file, e.loaded, e.total);
                }
                xhr.open('post', opts.url, true);
                xhr.send(data);
    		});
        }
    }

    function NginIFrame(opts) {
        var self = this;
        this.getFiles = function (e) {
            var target = e.target || e.srcElement;
            var id = target.getAttribute('id');
            var iframeId = '_stfileuploader' + genId();
            var formId = '_form' + iframeId;
            var ifm = createIframe(iframeId);
            var form = createForm(ifm, formId);
            var clone = target.cloneNode(true);
            
            target.removeAttribute('id');
            clone.setAttribute(id);
            target.parentNode.insertBefore(clone, target);
            target.setAttribute('name', opts.paramName);
            form.appendChild(target);
            // 创建数据域
            createField(form, opts.data);
    		// //继续添加文件
            var files = [{
                iframeId: iframeId,
                formId: formId,
                name: target.value.replace(/.*\\/, '')
            }];
            // 过滤文件
            files = opts.filter(files);
            // 设置唯一索引
            forEach(files, function(file) {
                file.index = genId();
            });
    		opts.fileList = opts.fileList.concat(files);
            //执行选择回调
    		opts.onSelect(files, opts.fileList);
    		return this;
        }
        this.deleteFile = function(fileDelete) {
            // IE8及以下数组不支持indexOf，手动实现
            var index = -1;
            forEach(opts.fileList, function (file, i) {
                if (file === fileDelete) {
                    index = i;
                }
            });
            if (!~index) {
                return this;
            }
            var deletedFile = opts.fileList.splice(index, 1)[0];
            if (deletedFile) {
                // 删除iframe和form
                document.body.removeChild(document.getElementById(deletedFile.iframeId));
                document.body.removeChild(document.getElementById(deletedFile.formId));
            }
    		return this;
        }
        this.uploadFiles = function(e) {
            var self = this;
    		forEach(opts.fileList, function (file, i) {
                var ifm = document.getElementById(file.iframeId);
                addEvent(ifm, 'load', function() {
                    try {
                        // ie67不支持contentDocument,所以改用了contentWindow
                        var result = ifm.contentWindow.document.body.innerHTML, eval2 = eval;
                        // 如果配置dataType为json则解析json,否则直接返回字符串
                        if (opts.dataType == 'json') {
                            if (typeof JSON != 'undefined' && JSON.parse) {
                                result = JSON.parse(result);
                            } else {
                                result = eval2('(' + result + ')');
                            }
                        }
                        opts.onSuccess(file, result);
                        self.deleteFile(file);
                    } catch (error) {
                        opts.onFailure(file, error);
                    }
                    opts.onFinish(file);
                    if (!opts.fileList.length) {
                        // 全部完毕
                        opts.onComplete();
                    }
                });
                document.getElementById(file.formId).submit();
    		});
        }
        this.destroy = function() {
            console.log('destroied');
        }
        
        /**
         * 创建iframe
         */
        function createIframe(id) {
            // ie 67 8? 下设置name无效，取代的是submitName
            // http://stackoverflow.com/questions/2138564/dynamic-iframe-ie-name-issue
            var ifm = /MSIE (6|7|8)/.test(navigator.userAgent) ? 
                document.createElement('<iframe name="' + id + '">') : 
                document.createElement('iframe');
            ifm.setAttribute('src', 'javascript:false;');
            ifm.setAttribute('id', id);
            ifm.setAttribute('name', id);
            ifm.style.display = 'none';
            document.body.appendChild(ifm);
            return ifm;
        }
        
        /**
         * 创建form
         */
        function createForm(ifm, id) {
            var form = document.createElement('form');
            form.setAttribute('id', id);
            form.setAttribute('method', 'post');
            form.setAttribute('action', opts.url);
            form.setAttribute('enctype', 'multipart/form-data');
            // 兼容ie67
            form.setAttribute('encoding', 'multipart/form-data');
            form.setAttribute('target', ifm.name);
            form.style.display = 'none';
            document.body.appendChild(form);
            return form;
        }
        
        /**
         * 创建数据域
         */
        function createField(form, data) {
            for (var j in data) {
                if (data.hasOwnProperty(j)) {
                    var input = document.createElement('input');
                    input.setAttribute('type', 'hidden');
                    input.setAttribute('name', j);
                    input.setAttribute('value', data[j]);
                    form.appendChild(input);
                }
            }
        }
    }

    var defaultOpts = {
        fileInput: null,				//html file控件
    	url: '',						//ajax地址
        paramName: 'file',
        dataType: 'json',               //响应数据格式
    	fileList: [],					//过滤后的文件数组
    	filter: function(files) {		//选择文件组的过滤方法
    		return files;
    	},
    	onSelect: noop,		            //文件选择后
    	onFinish: noop,		            //文件删除后
    	onProgress: noop,		        //文件上传进度
    	onSuccess: noop,		        //文件上传成功时
    	onFailure: noop,		        //文件上传失败时,
    	onComplete: noop		        //文件全部上传完毕时
    };

    function init(opts) {
        var instance = {
            opts: merge(defaultOpts, opts)
        };
        
        if (isSupportFormData()) {
            // 如果支持FormData则使用Html5引擎
            instance.ngin = new NginHtml5(instance.opts);
        } else {
            // 不支持则使用IFrame引擎
            instance.ngin = new NginIFrame(instance.opts);
        }
            
        //文件选择控件选择
        if (instance.opts.fileInput) {
            function handleChange(e) {
                instance.ngin.getFiles(e);
                var oldFileInput = instance.opts.fileInput;
                var parent = oldFileInput.parentNode;
                if (parent) {
                    var newFileInput = document.createElement('input');
                    newFileInput.setAttribute('type', 'file');
                    newFileInput.setAttribute('name', 'file');
                    newFileInput.setAttribute('id', oldFileInput.id);
                    addEvent(newFileInput, 'change', handleChange);
                    parent.replaceChild(newFileInput, oldFileInput);
                    instance.opts.fileInput = newFileInput;
                }
            }
            addEvent(instance.opts.fileInput, 'change', handleChange);
        }
        
        // 上传文件
        instance.upload = function() {
            this.ngin.uploadFiles();
        };

        return instance;
    }

    var index = {
        init: init
    }

    exports['default'] = index;

}));