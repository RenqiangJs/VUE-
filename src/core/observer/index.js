/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'
import Watcher from './watcher'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving(value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor(value: any) {
    console.log(value,'value')
    this.value = value
    this.dep = new Dep()        // 此处收集的依赖属于一个对象或者数组
    this.vmCount = 0
    def(value, '__ob__', this)   // 定义不可枚举属性__ob__,防止后续的遍历到__ob__属性
    if (Array.isArray(value)) {
      // hasProto判断当前环境是否支持__proto__属性
      if (hasProto) {
        // 设置目标数组的__proto__属性,arrayMethods是经过强化过的数组变异方法
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value)
    } else {
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk(obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray(items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment(target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment(target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */


// observe --> new Observer() --> difineReactive


export function observe(value: any, asRootData: ?boolean): Observer | void {
  // 被观测的数据不是一个对象或者是一个VNode实例直接返回
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  // 保存Observe实例
  let ob: Observer | void
  // 当一个数据对象被观测之后将会在该对象上定义 __ob__ 属性，所以 if 分支的作用是用来避免重复观测一个数据对象
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve && // 变量开关，定义在core/observer/index.js，有些地方需要动态切换状态
    !isServerRendering() && // 不是服务的渲染
    (Array.isArray(value) || isPlainObject(value)) && // 数据对象是数组或纯对象的时候
    Object.isExtensible(value) && // 数据对象必须是可扩展的，Object.preventExtensions()、Object.freeze() 以及 Object.seal()都会使一个对象变得不可扩展
    !value._isVue // Vue 实例对象拥有 _isVue 属性，所以这个条件用来避免 Vue 实例对象被观测
  ) {
    ob = new Observer(value);
  }
  // 根数据对象拥有vmCount,并且大于0
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive(
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean     // 是否深度观测一个对象
) {
  const dep = new Dep(); // 装观察者的容器，属于具体的某个字段

  const property = Object.getOwnPropertyDescriptor(obj, key);
  if (property && property.configurable === false) {
    return;
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get;
  const setter = property && property.set;
  // 第一个判断条件：
  /*
      简单的说就是当属性原本存在 get 拦截器函数时，在初始化的时候不要触发 get 函数，只有当真正
      的获取该属性的值的时候，再通过调用缓存下来的属性原本的 getter 函数取值即可。所以看到这里
      我能够发现，如果数据对象的某个属性原本就拥有自己的 get 函数，那么这个属性就不会被深度观测，
      因为当属性原本存在 getter 时，是不会触发取值动作的，即 val = obj[key] 不会执行，所以val
      是 undefined，这就导致在后面深度观测的语句中传递给 observe 函数的参数是 undefined
      当数据对象的某一个属性只拥有 get 拦截器函数而没有 set 拦截器函数时，此时该属性不会被深度观测。
      但是经过 defineReactive 函数的处理之后，该属性将被重新定义 getter 和 setter，此时该属
      性变成了既拥有 get 函数又拥有 set 函数。并且当我们尝试给该属性重新赋值时，那么新的值将会被观
      测。这时候矛盾就产生了：原本该属性不会被深度观测，但是重新赋值之后，新的值却被观测了。
  */
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key];
  }
  /* 
    const data = {
      a: {
        b: 1
      }
    }
    此处其实是一个递归操作，再次调用observe方法，发现如果val不是简单数据类型并且有了__ob__，会ob = new Observer(value);
    这样data.a的Observer实例对象会保存在childOb变量中,所以就有childOb === data.a.__ob__
  */
  let childOb = !shallow && observe(val);
  /* 
  依赖收集的整个过程：
    new Watcher()求值触发属性的getter拦截器属性--≥dep.depend()--≥调用watcher实例的addDep()-->调用Dep实例的addSub方法，完成依赖收集
  
  */
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter() {
      // 属性存在原有的get方法，就执行它返回值，不影响原有的取值操作，没有的话就直接返回val
      const value = getter ? getter.call(obj) : val;
      if (Dep.target) {
        /*
          对于属性 a 来讲，访问器属性 a 的 setter/getter 通过闭包引用了一个 Dep 实例对象，即属
          性 a 用来收集依赖的“筐”。除此之外访问器属性 a 的 setter/getter 还通过闭包引用着childOb，
          且 childOb === data.a.__ob__ 所以 childOb.dep === data.a.__ob__.dep。也就是说
           childOb.dep.depend() 这句话的执行说明除了要将依赖收集到属性 a 自己的“筐”里之外，还要将
           同样的依赖收集到 data.a.__ob__.dep 这里”筐“里，为什么要将同样的依赖分别收集到这两个不同
           的”筐“里呢？其实答案就在于这两个”筐“里收集的依赖的触发时机是不同的，即作用不同，两个”筐“如下：
              1.第一个”筐“是 dep
              2.第二个”筐“是 childOb.dep
          第一个”筐“里收集的依赖的触发时机是当   属性值  被修改时触发，即在 set 函数中触发：dep.notify()。
          而第二个”筐“里收集的依赖的触发时机是在使用 $set 或 Vue.set 给数据对象添加新属性时触发，我们知道
          由于 js 语言的限制，在没有 Proxy 之前 Vue 没办法拦截到给对象添加属性的操作。所以 Vue 才提供了
          $set 和 Vue.set 等方法让我们有能力给对象添加新属性的同时触发依赖，那么触发依赖是怎么做到的呢？
          就是通过数据对象的 __ob__ 属性做到的。因为 __ob__.dep 这个”筐“里收集了与 dep 这个”筐“同样的
          依赖。假设 Vue.set 函数代码如下：
        */
        dep.depend();    
        /* 
          如果发现value是数组的话就调用dependArray() 深度遍历数组属性，如果value里面有对象或者嵌套数组的话
          就调用_ob_.dep.depend()收集嵌套在里面的数组或对象的依赖
        */        
        /*
         在模板里使用了数据 arr，这将会触发数据对象的 arr 属性的 get 函数，我们知道 arr 属性的 get 函数通过闭包引用了两
         个用来收集依赖的”筐“，一个是属于 arr 属性自身的 dep 对象，另一个是 childOb.dep 对象，其中 childOb 就是 ob1。
         这时依赖会被收集到这两个”筐“中，但大家要注意的是 ob2.dep 这个”筐“中，是没有收集到依赖的。有的同学会说：”模板中依
         赖的数据是 arr，并不是 arr 数组的第一个对象元素，所以 ob2 没有收集到依赖很正常啊“，这是一个错误的想法，因为依赖
         了数组 arr 就等价于依赖了数组内的所有元素，数组内所有元素的改变都可以看做是数组的改变。但由于 ob2 没有收集到依赖，所以
         现在就导致如下代码触发不了响应：
           ins.$set(ins.$data.arr[0], 'b', 2)
        */
        if (childOb) {
          childOb.dep.depend();  
          /*之所以数组要特殊处理，是因为在vue中数组的索引是非响应式的，当arr是数组时，就要调用dependArray（）深度遍历
           data={
             arr:[]
           }
          */
          if (Array.isArray(value)) {
            dependArray(value);
          }
        }
      }
      return value;
    },
    set: function reactiveSetter(newVal) {
      const value = getter ? getter.call(obj) : val;
      /* eslint-disable no-self-compare */
      /*
        newVal全等于value 或
        newVal值为NaN,value值也为NaN的情况
      */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return;
      }
      /* eslint-enable no-self-compare */
      // initRender的时候，defineReactive $attrs跟$listeners的时候传入了customSetter，因为他们是只读属性，修改的时候会打印错误信息，customSetter就是用来打印辅助信息的
      if (process.env.NODE_ENV !== "production" && customSetter) {
        customSetter();
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return;
      if (setter) {
        setter.call(obj, newVal);
      } else {
        val = newVal;
      }
      childOb = !shallow && observe(newVal);
      dep.notify();
    },
  });
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set(target: Array<any> | Object, key: any, val: any): any {
  // 非生产环境下如果target是Null或者是undefined，则打印警告信息
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  // target是一个数组，并且key是一个有效的数组索引
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 取数组长度和key之间较大的值，因为如果key值大于数组长度，会导致接下来的splice无效
    target.length = Math.max(target.length, key)
    // 利用splice像数组插入新值，由于splice方法在前面是做过加强处理的，所能触发依赖
    target.splice(key, 1, val)
    return val
  }
  // 如果设置的key是对象上本来就有的，直接复制，因为对象的key是响应式的
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  // 数据对象__ob__的引用
  const ob = (target: any).__ob__
  // observe(data)的时候,asRootData为true，因此ob.vmCount大于0
  // 不允许给vue实例设置属性，也不允许给根数据data设置属性，因为data本身是非响应式的
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  // 将key转换成响应式
  defineReactive(ob.value, key, val);
  // 触发依赖
  ob.dep.notify();
  return val;

}
/**
 * Delete a property and trigger change if necessary.
 */
export function del(target: Array<any> | Object, key: any) {
  // 检测 target 是否是 undefined 或 null 或者是原始类型值
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  // 如果要删除的对象根本不在target,什么都不用做
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  // 如果没有ob,说明target不是响应式的,什么都不用做
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray(value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
