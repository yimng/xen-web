import reduxThunk from 'redux-thunk'
import {
  applyMiddleware,
  combineReducers,
  compose,
  createStore
} from 'redux'

import { connectStore as connectXo } from '../xo'

import DevTools from './dev-tools'
import reducer from './reducer'
import { XOA_PLAN } from 'xoa-updater'

// ===================================================================

const enhancers = [
  applyMiddleware(reduxThunk)
]
DevTools && enhancers.push(DevTools.instrument())

const store = createStore(
  combineReducers(reducer),
  compose.apply(null, enhancers)
)

connectXo(store)

if (XOA_PLAN < 5) {
  require('xoa-updater').connectStore(store)
}

export default store
