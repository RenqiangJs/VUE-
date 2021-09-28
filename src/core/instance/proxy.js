/* not type checking this file because flow doesn't play well with Proxy */

import config from 'core/config'
import { warn, makeMap, isNative } from '../util/index'

let initProxy

if (process.env.NODE_ENV !== 'production') {
  // 作用是判断给定的 key 是否出现在下面字符串中定义的关键字中的。这些关键字都是在 js 中可以全局访问的
  const allowedGlobals = makeMap(
    "Infinity,undefined,NaN,isFinite,isNaN," +
      "parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent," +
      "Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt," +
      "require" // for Webpack/Browserify
  );

  const warnNonPresent = (target, key) => {
    warn(
      `Property or method "${key}" is not defined on the instance but ` +
        "referenced during render. Make sure that this property is reactive, " +
        "either in the data option, or for class-based components, by " +
        "initializing the property. " +
        "See: https://vuejs.org/v2/guide/reactivity.html#Declaring-Reactive-Properties.",
      target
    );
  };

  const warnReservedPrefix = (target, key) => {
    warn(
      `Property "${key}" must be accessed with "$data.${key}" because ` +
        'properties starting with "$" or "_" are not proxied in the Vue instance to ' +
        "prevent conflicts with Vue internals. " +
        "See: https://vuejs.org/v2/api/#data",
      target
    );
  };

  const hasProxy = typeof Proxy !== "undefined" && isNative(Proxy);

  if (hasProxy) {
    // 检测给定的值是否是内置的事件修饰符
    const isBuiltInModifier = makeMap(
      "stop,prevent,self,ctrl,shift,alt,meta,exact"
    );
    /* 
      为config.keyCodes设置set代理，其目的是防止开发者在自定义键位别名的时候，覆盖了内置的修饰符
      例如: Vue.config.keyCodes.shift = 16 
    */
    config.keyCodes = new Proxy(config.keyCodes, {
      set(target, key, value) {
        if (isBuiltInModifier(key)) {
          warn(
            `Avoid overwriting built-in modifier in config.keyCodes: .${key}`
          );
          return false;
        } else {
          target[key] = value;
          return true;
        }
      },
    });
  }

  const hasHandler = {
    has(target, key) {
      const has = key in target;
      // 如果 key 在 allowedGlobals 之内，或者 key 是以下划线 _ 开头并且未定义在data里面的字符串，则为真
      const isAllowed =
        allowedGlobals(key) ||
        (typeof key === "string" &&
          key.charAt(0) === "_" &&
          !(key in target.$data));
      // 这里的判断意思是你访问了一个没在实例是定义的属性，并且该对象不是全局对象
      if (!has && !isAllowed) {
        if (key in target.$data) warnReservedPrefix(target, key);
        else warnNonPresent(target, key);
      }
      return has || !isAllowed;
    },
  };

  const getHandler = {
    get(target, key) {
      if (typeof key === "string" && !(key in target)) {
        if (key in target.$data) warnReservedPrefix(target, key);
        else warnNonPresent(target, key);
      }
      return target[key];
    },
  };

  initProxy = function initProxy (vm) {
    // hasProxy判断宿主环境是否支持js原生的proxy
    if (hasProxy) {
      // determine which proxy handler to use
      const options = vm.$options;
      /* 
        因为在使用 webpack 配合 vue-loader 的环境中， vue-loader 会借
        助 vuejs@component-compiler-utils 将 template 编译为不使用 
        with 语句包裹的遵循严格模式的 JavaScript，并为编译后的 render 方
        法设置 render._withStripped = true
      */
      const handlers =
        options.render && options.render._withStripped
          ? getHandler
          : hasHandler;
      // 对vm的访问做一层代理，instance/render.js里面的Vue.prototype._render函数中render.call(vm._renderProxy, vm.$createElement)
      // render函数的作用域绑定为vm._renderProxy，这个代理的作用就是为了在开发阶段给我们一个友好而准确的提示。
      vm._renderProxy = new Proxy(vm, handlers);
    } else {
      vm._renderProxy = vm;
    }
  };
}

export { initProxy }
