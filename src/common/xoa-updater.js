import assign from 'lodash/assign'
import Client, {AbortedConnection, ConnectionError} from 'jsonrpc-websocket-client'
import eventToPromise from 'event-to-promise'
import forEach from 'lodash/forEach'
import makeError from 'make-error'
import map from 'lodash/map'
import { EventEmitter } from 'events'
import {
  xoaConfiguration,
  xoaRegisterState,
  xoaTrialState,
  xoaUpdaterLog,
  xoaUpdaterState
} from 'store/actions'

import {
  startTrial,
  getLicense
} from 'xo'

// ===================================================================

var XOA_PLAN = 1
const states = [
  'disconnected',
  'updating',
  'upgrading',
  'upToDate',
  'upgradeNeeded',
  'registerNeeded',
  'error'
]

// ===================================================================

export function isTrialRunning (trial) {
  return (trial && trial.end && Date.now() < trial.end)
}

export function exposeTrial (trial) {
  // We won't suggest trial if any trial is running now, or if premium was enjoyed in any past trial
  return !(trial && (isTrialRunning(trial) || trial.plan === 'premium'))
}

export function blockXoaAccess (xoaState) {
  let block = xoaState.state === 'untrustedTrial'
  if (XOA_PLAN > 1 && XOA_PLAN < 5) {
    block = block || xoaState.state === 'ERROR'
  }
  return block
}

function getCurrentUrl () {
  if (typeof window === 'undefined') {
    throw new Error('cannot get current URL')
  }
  return String(window.location)
}

function adaptUrl (url, port = null) {
  const matches = /^http(s?):\/\/([^/:]*(?::[^/]*)?)(?:[^:]*)?$/.exec(url)
  if (!matches || !matches[2]) {
    throw new Error('current URL not recognized')
  }
  return 'ws' + matches[1] + '://' + matches[2] + '/api/updater'
}

// ===================================================================

export const NotRegistered = makeError('NotRegistered')

class XoaUpdater extends EventEmitter {
  constructor () {
    super()
    this._waiting = false
    this._log = []
    this._lastRun = 0
    this._lowState = null
    this.state('disconnected')
    this.registerError = ''
    this._configuration = {}
  }

  state (state) {
    console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>state')
    this._state = state
    this.emit(state, this._lowState && this._lowState.source)
  }

  async update () {
    console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>update')
    if (this._waiting) {
      return
    }
    //this._waiting = true
    this.state('updating')
    this._update(false)
  }

  async upgrade () {
    console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>upgrade')
    if (this._waiting) {
      return
    }
    //this._waiting = true
    this.state('upgrading')
    await this._update(true)
  }

  _upgradeSuccessful () {
    this.emit('upgradeSuccessful', this._lowState && this._lowState.source)
  }


  async isRegistered () {
    console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>isRegistered')
    try {
      this.registerState = 'registered'
      this.token = ''
      return token
    } catch (error) {
    } finally {
      this.emit('registerState', {state: this.registerState, email: 'vStorage@halsign.com', error: ''})
    }
  }


  async register (email, password, renew = false) {
  }

  async requestTrial () {
    console.log('>>>>>>>>>>>>>>>>>>>>>>begin requestTrial')
    const state = await this._update()
    console.log('>>>>>>>>>>>>>>>>>>>>>>state' + state)
    if (!state.state === 'ERROR') {
      throw new Error(state.message)
    }
    if (isTrialRunning(state.trial)) {
      throw new Error('You are already under trial')
    }
    try {
      await startTrial()
    } finally {
      this._update()
    }
  }

  async xoaState () {
    try {
      //const state = await this._call('xoaState')
      console.log(">>>>>>>>>>>>>>begin xoaState<<<<<<<<<<<<<<")
      const license = await getLicense()
      XOA_PLAN = license.edition 
      console.log(">>>>>>>>>>>>>>>>>>>>>>>>License")
      console.log(license)
      console.log(">>>>>>>>>>>>>>>>>>>>>>>>License")
      let expire = license.expire
      let trial = {plan: 'premium', end: expire}
      const state = {
        state: 'trustedTrial',
        message: 'You have a vStorage Appliance granted under trial. Your trial lasts until ' + new Date(trial.end).toLocaleString(),
        trial
      }
      this._xoaState = state
      return state
    } catch (error) {
      return this._xoaStateError(error)
    } finally {
      this.emit('trialState', assign({}, this._xoaState))
    }
  }

  _xoaStateError (error) {
    console.log('>>>>>>>>>>>>>>>>>>begin _xoaStateError')
    const message = error.message || String(error)
    this._xoaState = {
      state: 'ERROR',
      message
    }
    return this._xoaState
  }

  async _update (upgrade = false) {
    try {
      //const c = await this._open()
      this.log('info', 'Start ' + (upgrade ? 'upgrading' : 'updating' + '...'))
      //c.notify('update', {upgrade})
      console.log(">>>>>>begin _update<<<<<<<<<<<<<<")

      const license = await getLicense()
      console.log(">>>>>>>>>>>>>>>>>>>>>>>>License")
      console.log(license)
      console.log(">>>>>>>>>>>>>>>>>>>>>>>>License")
      XOA_PLAN = license.edition 
      if (license.edition > 1) {
        let expire = license.expire 
        let trial = {plan: 'premium', end: expire}
        if(isTrialRunning(trial)) {
          const state = {
            state: 'trustedTrial',
            message: 'You have a vStorage Appliance granted under license. Your license lasts until ' + new Date(trial.end).toLocaleString(),
            trial
          }
          this._xoaState = state
          return state
        } else {
          XOA_PLAN = 1
          const state = {
            state: 'trustedTrial',
            message: 'Your license has been expired',
            trial
          }
          this._xoaState = state
          return state
        }
      } else {
        let st = ''
        if (license.state === 'default') {
          st = 'default'
        }
        const state = {
          state: st,
          message: license.message,
          trial: {plan: 'free'}
        }
        this._xoaState = state
        return state
      }
    } catch (error) {
      this._waiting = false
    } finally {
      this.emit('trialState', assign({}, this._xoaState))
    }
  }

  async start () {
    console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>updater is starting....")
    if (this.isStarted()) {
      return
    }
    await this._update()
    await this.isRegistered()
    this._interval = setInterval(() => this.run(), 60 * 60 * 1000)
    this.run()
  }

  stop () {
    if (this._interval) {
      clearInterval(this._interval)
      delete this._interval
    }
    if (this._client) {
      this._client.removeAllListeners()
      if (this._client.status !== 'closed') {
        this._client.close()
      }
      delete this._client
    }
    console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>stooooooooooooooooooop")
    this.state('disconnected')
  }

  run () {
    console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>runing<<<<<<<<<<<<<<<<<<<<<<')
    if (Date.now() - this._lastRun >= 1 * 60 * 60 * 1000) {
      this.update()
    }
  }

  isStarted () {
    return this._interval
  }

  log (level, message) {
    console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>log')
    message = (message != null && message.message) || String(message)
    const date = new Date()
    this._log.unshift({
      date: date.toLocaleString(),
      level,
      message
    })
    while (this._log.length > 10) {
      this._log.pop()
    }
    this.emit('log', map(this._log, item => assign({}, item)))
  }

  async getConfiguration () {
    try {
      //this._configuration = await this._call('getConfiguration')
      this._configuration = {}
      return this._configuration
    } catch (error) {
      this._configuration = {}
    } finally {
      this.emit('configuration', assign({}, this._configuration))
    }
  }

  async _call (...args) {
    const c = await this._open()
    try {
      return await c.call(...args)
    } catch (error) {
      this.log('error', error)
      throw error
    }
  }

  async configure (config) {
    try {
      this._configuration = {}//await this._call('configure', config)
      this.update()
      return this._configuration
    } catch (error) {
      this._configuration = {}
    } finally {
      this.emit('configuration', assign({}, this._configuration))
    }
  }
}

const xoaUpdater = new XoaUpdater()

export default xoaUpdater

export const connectStore = (store) => {
  forEach(states, state => xoaUpdater.on(state, () => store.dispatch(xoaUpdaterState(state))))
  xoaUpdater.on('trialState', state => store.dispatch(xoaTrialState(state)))
  xoaUpdater.on('log', log => store.dispatch(xoaUpdaterLog(log)))
  xoaUpdater.on('registerState', registration => store.dispatch(xoaRegisterState(registration)))
  xoaUpdater.on('configuration', configuration => store.dispatch(xoaConfiguration(configuration)))
}

export {XOA_PLAN}
