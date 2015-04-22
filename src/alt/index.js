import AltAction from './AltAction'
import Symbol from 'es-symbol'
import assign from 'object-assign'
import formatAsConstant from './utils/formatAsConstant'
import getInternalMethods from './utils/getInternalMethods'
import uid from './utils/uid'
import { Dispatcher } from 'flux'
import { warn } from './utils/warnings'
import * as StoreUtils from './utils/StoreUtils'
import * as Sym from './symbols/symbols'
import * as StateFunctions from './utils/StateFunctions'
import createStoreConfig from './utils/createStoreConfig'

const {
  createStoreFromObject,
  createStoreFromClass,
  transformStore
} = StoreUtils
const {
  ACTION_HANDLER,
  ACTION_KEY,
  INIT_SNAPSHOT,
  LAST_SNAPSHOT,
  LIFECYCLE
} = Sym
const {
  filterSnapshots,
  saveInitialSnapshot,
  setAppState,
  snapshot
} = StateFunctions

const ACTIONS_REGISTRY = Symbol()

function dispatchIdentity(x, ...a) {
  this.dispatch(a.length ? [x].concat(a) : x)
}

class Alt {
  constructor(config = {}) {
    this.config = config
    this.serialize = config.serialize || JSON.stringify
    this.deserialize = config.deserialize || JSON.parse
    this.dispatcher = config.dispatcher || new Dispatcher()
    this.actions = { single: {} }
    this.stores = {}
    this.storeTransforms = config.storeTransforms || []
    this[ACTIONS_REGISTRY] = {}
    this[INIT_SNAPSHOT] = {}
    this[LAST_SNAPSHOT] = {}
  }

  dispatch(action, data) {
    this.dispatcher.dispatch({ action, data })
  }

  createUnsavedStore(StoreModel, ...args) {
    const key = StoreModel.displayName || ''
    createStoreConfig(this.config, StoreModel)
    const Store = transformStore(this.storeTransforms, StoreModel)

    return typeof Store === 'object'
      ? createStoreFromObject(this, Store, key)
      : createStoreFromClass(this, Store, key, ...args)
  }

  createStore(StoreModel, iden, ...args) {
    let key = iden || StoreModel.displayName || StoreModel.name || ''
    createStoreConfig(this.config, StoreModel)
    const Store = transformStore(this.storeTransforms, StoreModel)

    if (this.stores[key] || !key) {
      if (this.stores[key]) {
        warn(
          `A store named ${key} already exists, double check your store ` +
          `names or pass in your own custom identifier for each store`
        )
      } else {
        warn('Store name was not specified')
      }

      key = uid(this.stores, key)
    }

    const storeInstance = typeof Store === 'object'
      ? createStoreFromObject(this, Store, key)
      : createStoreFromClass(this, Store, key, ...args)

    this.stores[key] = storeInstance
    saveInitialSnapshot(this, key)

    return storeInstance
  }

  generateActions(...actionNames) {
    const actions = { name: 'single' }
    return this.createActions(actionNames.reduce((obj, action) => {
      obj[action] = dispatchIdentity
      return obj
    }, actions))
  }

  createAction(name, implementation, obj) {
    const actionId = uid(this[ACTIONS_REGISTRY], name)
    this[ACTIONS_REGISTRY][actionId] = 1
    const actionName = Symbol.for(`alt/${actionId}`)

    // Wrap the action so we can provide a dispatch method
    const newAction = new AltAction(this, actionName, implementation, obj)

    const action = newAction[ACTION_HANDLER]
    action.defer = (...args) => {
      setTimeout(() => {
        newAction[ACTION_HANDLER].apply(null, args)
      })
    }
    action[ACTION_KEY] = actionName
    action.id = actionId
    return (this.actions.single[actionId] = action)
  }

  createActions(ActionsClass, exportObj = {}, ...argsForConstructor) {
    const actions = {}
    const key = uid(
      this[ACTIONS_REGISTRY],
      ActionsClass.displayName || ActionsClass.name || 'Unknown'
    )

    if (typeof ActionsClass === 'function') {
      assign(actions, getInternalMethods(ActionsClass.prototype, true))
      class ActionsGenerator extends ActionsClass {
        constructor(...args) {
          super(...args)
        }

        generateActions(...actionNames) {
          actionNames.forEach((actionName) => {
            actions[actionName] = dispatchIdentity
          })
        }
      }

      assign(actions, new ActionsGenerator(...argsForConstructor))
    } else {
      assign(actions, ActionsClass)
    }

    this.actions[key] = this.actions[key] || {}

    return Object.keys(actions).reduce((obj, action) => {
      if (typeof actions[action] !== 'function') {
        return obj
      }

      // create the action
      const name = `${key}#${action}`
      obj[action] = this.createAction(name, actions[action], obj)

      // remove the action referenced in single
      delete this.actions.single[obj[action].id]

      // add namespaced action
      const id = uid(this.actions[key], action)
      this.actions[key][id] = obj[action]

      // create a constant
      const constant = formatAsConstant(action)
      obj[constant] = obj[action][ACTION_KEY]

      return obj
    }, exportObj)
  }

  takeSnapshot(...storeNames) {
    const state = snapshot(this, storeNames)
    assign(this[LAST_SNAPSHOT], state)
    return this.serialize(state)
  }

  rollback() {
    setAppState(this, this.serialize(this[LAST_SNAPSHOT]), (store) => {
      if (store[LIFECYCLE].rollback) {
        store[LIFECYCLE].rollback()
      }
      store.emitChange()
    })
  }

  recycle(...storeNames) {
    const initialSnapshot = storeNames.length
      ? filterSnapshots(this, this[INIT_SNAPSHOT], storeNames)
      : this[INIT_SNAPSHOT]

    setAppState(this, this.serialize(initialSnapshot), (store) => {
      if (store[LIFECYCLE].init) {
        store[LIFECYCLE].init()
      }
      store.emitChange()
    })
  }

  flush() {
    const state = this.serialize(snapshot(this))
    this.recycle()
    return state
  }

  bootstrap(data) {
    setAppState(this, data, (store) => {
      if (store[LIFECYCLE].bootstrap) {
        store[LIFECYCLE].bootstrap()
      }
      store.emitChange()
    })
  }

  prepare(store, payload) {
    const data = {}
    if (!store._storeName) {
      throw new ReferenceError('Store provided does not have a name')
    }
    data[store._storeName] = payload
    return this.serialize(data)
  }

  // Instance type methods for injecting alt into your application as context

  addActions(name, ActionsClass, ...args) {
    this.actions[name] = Array.isArray(ActionsClass)
      ? this.generateActions.apply(this, ActionsClass)
      : this.createActions(ActionsClass, ...args)
  }

  addStore(name, StoreModel, ...args) {
    this.createStore(StoreModel, name, ...args)
  }

  getActions(name) {
    return this.actions[name]
  }

  getStore(name) {
    return this.stores[name]
  }
}

export default Alt
