/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  invokeWithErrorHandling,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    isRenderWatcher?: boolean
  ) {
    this.vm = vm
    // 如果是渲染watcher的话，当前组件的_watcher属性引用着当前观察者实例
    if (isRenderWatcher) {
      vm._watcher = this
    }
    // 保存着当前组件的所有watcher，_watchers在initstate的时候初始化
    vm._watchers.push(this)
    // options
    if (options) {
      this.deep = !!options.deep    // 用来告诉当前观察者实例对象是否是深度观测
      this.user = !!options.user    // 用来标识当前观察者实例对象是 开发者定义的 还是 内部定义的
      this.lazy = !!options.lazy    // 用来标识当前观察者实例对象是否是计算属性的观察者
      this.sync = !!options.sync   // 用来告诉观察者当数据变化时是否同步求值并执行回调
      this.before = options.before  // 可以理解为 Watcher 实例的钩子，当数据变化之后，触发更新之前，调用在创建渲染函数的观察者实例对象时传递的 before 选项
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb  // 当前观察实例的唯一标识
    this.id = ++uid // uid for batching
    this.active = true  // 当前观察者实例是否为激活状态，默认为true
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
    } else {
      // 解析expOrFn的合法性，并生成expOrFn的取值函数
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  get () {
    // 将当前观察者实例对象赋值给Dep.target，这个实例对象就是即将要收集的目标
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value)
      }
      popTarget()
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  addDep (dep: Dep) {
    const id = dep.id
    // 避免一次求值过程中重复收集依赖
    if (!this.newDepIds.has(id)) {
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      // 避免多次求值（数据变化时重新求值的过程）过程中重复收集依赖
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps () {
    let i = this.deps.length
    /*
      这段 while 循环就是对 deps 数组进行遍历，也就是对上一次求值所收集到的 Dep 对象进行遍历，然
      后在循环内部检查上一次求值所收集到的 Dep 实例对象是否存在于当前这次求值所收集到的 Dep 实例对
      象中，如果不存在则说明该 Dep 实例对象已经和该观察者不存在依赖关系了，这时就会调用 dep.removeSub(this)
      方法并以该观察者实例对象作为参数传递，从而将该观察者对象从 Dep 实例对象中移除。
    */
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    // 前三行this.depIds和this.newDepIds交换值
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    // 清空this.newDepIds
    this.newDepIds.clear()
    // 前三行this.deps和this.newDeps交换值
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    // 清空this.newDeps
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      const value = this.get()
      // if代码块是为非渲染watcher准备的
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        // 用户自定义的watcher，例如watch
        if (this.user) {
          const info = `callback for watcher "${this.expression}"`
          invokeWithErrorHandling(this.cb, this.vm, [value, oldValue], this.vm, info)
        } else {
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      // 每个组件实例都有_isBeingDestroyed属性，标识当前组件是否被销毁（true已销毁，false未销毁）
      if (!this.vm._isBeingDestroyed) {
        // 由于这个操作的性能开销比较大，所以仅在组件没有被销毁的情况下才会执行此操作
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      /*
        当一个属性与一个观察者建立联系之后，属性的 Dep 实例对象会收集到该观察者对象，同时观察者
        对象也会将该 Dep 实例对象收集，这是一个双向的过程，并且一个观察者可以同时观察多个属性，这
        些属性的 Dep 实例对象都会被收集到该观察者实例对象的 this.deps 数组中，所以解除属性与观
        察者之间关系的第二步就是将当前观察者实例对象从所有的 Dep 实例对象中移除
      */
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
