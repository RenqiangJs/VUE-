/* @flow */

import { _Set as Set, isObject } from '../util/index'
import type { SimpleSet } from '../util/index'
import VNode from '../vdom/vnode'

const seenObjects = new Set()

/**
 * Recursively traverse an object to evoke all converted
 * getters, so that every nested property inside the object
 * is collected as a "deep" dependency.
 */
export function traverse (val: any) {
  _traverse(val, seenObjects)
  seenObjects.clear()
}

function _traverse (val: any, seen: SimpleSet) {
  let i, keys
  const isA = Array.isArray(val)
  // 所以被观察属性的值要么是一个对象要么是一个数组，并且该值不能是冻结的，同时也不应该是 VNode 实例(这是Vue单独做的限制)
  if ((!isA && !isObject(val)) || Object.isFrozen(val) || val instanceof VNode) {
    return
  }
  // 使用 obj1 或 obj2 这两个对象中的任意一个对象出现在 Vue 的响应式数据中，如果不做防循环引用的处理，将会导致死循环
  /*
    const obj1 = {}
    const obj2 = {}

    obj1.data = obj2
    obj2.data = obj1
  */
  if (val.__ob__) {
    const depId = val.__ob__.dep.id
    if (seen.has(depId)) {
      return
    }
    seen.add(depId)
  }
  if (isA) {
    i = val.length
    /* 
      这段代码的关键在于递归调用 _traverse 函数时所传递的第一个参数：val[i] 和 val[keys[i]]。这
      两个参数实际上是在读取子属性的值，这将触发子属性的 get 拦截器函数，保证子属性能够收集到观察者，仅此而已。
    */
    while (i--) _traverse(val[i], seen)
  } else {
    keys = Object.keys(val)
    i = keys.length
    while (i--) _traverse(val[keys[i]], seen)
  }
}
