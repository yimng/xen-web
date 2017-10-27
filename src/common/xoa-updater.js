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

let XOA_PLAN = 1
const states = [
  'free',
  'upToDate',
  'upgradeNeeded',
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


// ===================================================================

export const NotRegistered = makeError('NotRegistered')

class XoaUpdater extends EventEmitter {
  constructor () {
    super()
    this._waiting = false
    this._log = []
    this.state('disconnected')
  }

  state (state) {
    this._state = state
    this.emit(state, this._state)
  }

  async update () {
    if (this._waiting) {
      return
    }
    this._waiting = true
    this._update()
  }

  async isRegistered () {
    try {
      this.registerState = 'registered'
      this.token = ''
      return token
    } catch (error) {
      this.update()
    } finally {
      this.emit('registerState', {state: this.registerState, email: 'vStorage@halsign.com', error: ''})
    }
  }

  async requestTrial () {
    this.log('Request trial for 30 days...')
    const state = await this._update()
    if (!state.state === 'ERROR') {
      throw new Error(state.message)
    }
    if (isTrialRunning(state.trial)) {
      throw new Error('You are already under trial')
    }
    await startTrial()
  }

  _xoaStateError (error) {
    const message = error.message || String(error)
    this._xoaState = {
      state: 'ERROR',
      message
    }
    return this._xoaState
  }

  async _update () {
    try {
      this.log('info', 'Start updating...')

      const license = await getLicense()
      this.log('info', 'vStorage license: ' + license.plan)
      XOA_PLAN = license.edition 
      if (license.edition > 1) {
        let expire = license.expire 
        let trial = {plan: license.plan, end: expire}
        if(isTrialRunning(trial)) {
          const state = {
            state: 'trustedTrial',
            message: 'You have a vStorage granted under license. Your license lasts until ' + new Date(trial.end).toLocaleString(),
            trial
          }
          this._xoaState = state
          this.state('upToDate')
          return state
        } else {
          XOA_PLAN = 1
          const state = {
            state: 'trustedTrial',
            message: 'Your license has been expired',
            trial
          }
          this._xoaState = state
          this.state('upgradeNeeded')
          return state
        }
      } else {
        const state = {
          state: 'default',
          message: license.message,
          trial: {plan: 'free'}
        }
        this._xoaState = state
        this.state('free')
        return state
      }
    } catch (error) {
      //this.state('error')
    } finally {
      this._waiting = false
      this.emit('trialState', assign({}, this._xoaState))
    }
  }

  async start () {
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
    this.state('error')
  }

  run () {
    //if (Date.now() - this._lastRun >= 1 * 60 * 60 * 1000) {
      this.update()
    //}
  }

  isStarted () {
    return this._interval
  }

  log (level, message) {
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
