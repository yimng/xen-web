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

  async _open () {
    const openFailure = error => {
      switch (true) {
        case error instanceof AbortedConnection:
          this.log('error', 'AbortedConnection')
          break
        case error instanceof ConnectionError:
          this.log('error', 'ConnectionError')
          break
        default:
          this.log('error', error)
      }
      delete this._client
      this.state('disconnected')
      throw error
    }

    const handleOpen = c => {
      const middle = new EventEmitter()
      const handleError = error => {
        this.log('error', error.message)
        this._lowState = error
        this.state('error')
        this._waiting = false
        this.emit('error', error)
      }

      c.on('notification', n => middle.emit(n.method, n.params))
      c.on('closed', () => middle.emit('disconnected'))

      middle.on('print', ({content}) => {
        Array.isArray(content) || (content = [content])
        content.forEach(elem => this.log('info', elem))
        this.emit('print', content)
      })
      middle.on('end', end => {
        this._lowState = end
        switch (this._lowState.state) {
          case 'xoa-up-to-date':
          case 'xoa-upgraded':
          case 'updater-upgraded':
          case 'installer-upgraded':
            this.state('upToDate')
            break
          case 'xoa-upgrade-needed':
          case 'updater-upgrade-needed':
          case 'installer-upgrade-needed':
            this.state('upgradeNeeded')
            break
          case 'register-needed':
            this.state('registerNeeded')
            break
          default:
            this.state('error')
        }
        this.log(end.level, end.message)
        this._lastRun = Date.now()
        this._waiting = false
        this.emit('end', end)
        if (this._lowState === 'register-needed') {
          this.isRegistered()
        }
        if (this._lowState.state === 'updater-upgraded' || this._lowState.state === 'installer-upgraded') {
          this.update()
        } else if (this._lowState.state === 'xoa-upgraded') {
          this._upgradeSuccessful()
        }
        this.xoaState()
      })
      middle.on('warning', warning => {
        this.log('warning', warning.message)
        this.emit('warning', warning)
      })
      middle.on('server-error', handleError)
      middle.on('disconnected', () => {
        this._lowState = null
        this.state('disconnected')
        this._waiting = false
        this.log('warning', 'Lost connection with xoa-updater')
        middle.emit('reconnect_failed') // No reconnecting attempts implemented so far
      })
      middle.on('reconnect_failed', () => {
        this._waiting = false
        middle.removeAllListeners()
        this._client.removeAllListeners()
        if (this._client.status !== 'closed') {
          this._client.close()
        }
        delete this._client
        const message = 'xoa-updater could not be reached'
        this._xoaStateError({message})
        this.log('error', message)
        this.emit('disconnected')
      })

      this.update()
      this.isRegistered()
      this.getConfiguration()
      return c
    }

    if (!this._client) {
      try {
        this._client = new Client(adaptUrl(getCurrentUrl()))
        await this._client.open()
        handleOpen(this._client)
      } catch (error) {
        openFailure(error)
      }
    }
    const c = this._client
    if (c.status === 'open') {
      return c
    } else {
      return eventToPromise.multi(c, ['open'], ['closed', 'error'])
        .then(() => c)
    }
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
    try {
      const token = {}//await this._call('register', {email, password, renew})
      this.registerState = 'registered'
      this.registerError = ''
      this.token = token
      return token
    } catch (error) {
      if (!renew) {
        delete this.token
      }
      if (error.code && error.code === 1) {
        this.registerError = 'Authentication failed'
      } else {
        this.registerError = error.message
        this.registerState = 'error'
      }
    } finally {
      this.emit('registerState', {state: this.registerState, email: (this.token && this.token.registrationEmail) || '', error: this.registerError})
      if (this.registerState === 'registered') {
        this.update()
      }
    }
  }

  async requestTrial () {
    console.log('>>>>>>>>>>>>>>>>>>>>>>begin requestTrial')
    const state = await this.xoaState()
    if (!state.state === 'ERROR') {
      throw new Error(state.message)
    }
    if (isTrialRunning(state.trial)) {
      throw new Error('You are already under trial')
    }
    try {
      //return this._call('requestTrial', {trialPlan: 'premium'})
      let now = new Date();
      let expire = now.setDate(now.getDate() + 30);
      let trial = {plan: 'premium', end: expire}
      return trial 
    } finally {
      this.xoaState()
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
      let expire = license.expire 
      let trial = {plan: 'premium', end: expire}
      const state = {
        state: 'trustedTrial',
        message: 'You have a vStorage Appliance granted under trial. Your trial lasts until ' + new Date(trial.end).toLocaleString(),
        trial
      }
      this._xoaState = state
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
    await this.xoaState()
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
