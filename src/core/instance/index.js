import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

function Vue (options) {
  // 用安全模式提醒必须要以new操作符调用vue构造函数
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options)
}

initMixin(Vue)  // 往Vue原型上添加_init方法，在new vue的时候，执行this._init(options)
stateMixin(Vue)  // 往原型上添加$data，$props，$set，$delete，$watch属性
eventsMixin(Vue)  // 在实例上面添加$on,$once,$off,$emit
lifecycleMixin(Vue)  // 在实例上面添加_update,$forceUpdate,$destroy
renderMixin(Vue)

export default Vue
