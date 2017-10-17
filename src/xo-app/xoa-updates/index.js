import _, { messages } from 'intl'
import ActionButton from 'action-button'
import ansiUp from 'ansi_up'
import assign from 'lodash/assign'
import Button from 'button'
import Component from 'base-component'
import Icon from 'icon'
import isEmpty from 'lodash/isEmpty'
import map from 'lodash/map'
import Page from '../page'
import React from 'react'
import Tooltip from 'tooltip'
import xoaUpdater, { exposeTrial, isTrialRunning } from 'xoa-updater'
import { confirm } from 'modal'
import { connectStore } from 'utils'
import { Card, CardBlock, CardHeader } from 'card'
import { Container, Row, Col } from 'grid'
import { error } from 'notification'
import { injectIntl } from 'react-intl'
import { Password } from 'form'
import { serverVersion } from 'xo'

import pkg from '../../../package'
import { XOA_PLAN } from 'xoa-updater'

let updateSource
const promptForReload = (source, force) => {
  if (force || (updateSource && source !== updateSource)) {
    confirm({
      title: _('promptUpgradeReloadTitle'),
      body: <p>{_('promptUpgradeReloadMessage')}</p>
    }).then(() => window.location.reload())
  }
  updateSource = source
}

if (+XOA_PLAN < 5) {
  xoaUpdater.start()
  xoaUpdater.on('upgradeSuccessful', source => promptForReload(source, !source))
  xoaUpdater.on('upToDate', promptForReload)
}

const HEADER = <Container>
  <h2><Icon icon='menu-update' /> {_('updatePage')}</h2>
</Container>

// FIXME: can't translate
const states = {
  disconnected: 'Disconnected',
  updating: 'Updating',
  upgrading: 'Upgrading',
  upToDate: 'Up to Date',
  upgradeNeeded: 'Upgrade required',
  registerNeeded: 'Registration required',
  error: 'An error occured'
}

const update = () => xoaUpdater.update()
const upgrade = () => xoaUpdater.upgrade()

@connectStore((state) => {
  return {
    configuration: state.xoaConfiguration,
    log: state.xoaUpdaterLog,
    registration: state.xoaRegisterState,
    state: state.xoaUpdaterState,
    trial: state.xoaTrialState
  }
})

@injectIntl
export default class XoaUpdates extends Component {

  _trialAllowed = trial => trial.state === 'default' && exposeTrial(trial.trial)
  _trialAvailable = trial => trial.state === 'trustedTrial' && isTrialRunning(trial.trial)
  _trialConsumed = trial => trial.state === 'trustedTrial' && !isTrialRunning(trial.trial) && !exposeTrial(trial.trial)
  _updaterDown = trial => isEmpty(trial) || trial.state === 'ERROR'
  _toggleAskRegisterAgain = () => this.setState({ askRegisterAgain: !this.state.askRegisterAgain })

  _startTrial = async () => {
    try {
      await confirm({
        title: _('trialReadyModal'),
        body: <p>{_('trialReadyModalText')}</p>
      })
      return xoaUpdater.requestTrial()
        .then(() => xoaUpdater.update())
        .catch(err => error('Request Trial', err.message || String(err)))
    } catch (_) {}
  }

  componentWillMount () {
    this.setState({ askRegisterAgain: false })
    serverVersion.then(serverVersion => {
      this.setState({ serverVersion })
    })
    update()
  }

  render () {
    const textClasses = {
      info: 'text-info',
      success: 'text-success',
      warning: 'text-warning',
      error: 'text-danger'
    }

    const {
      log,
      registration,
      state,
      trial
    } = this.props

    const alreadyRegistered = (registration.state === 'registered')
    const { formatMessage } = this.props.intl
    return <Page header={HEADER} title='updateTitle' formatTitle>
      <Container>{+XOA_PLAN === 5
        ? <div>
          <h2 className='text-danger'>{_('noUpdaterCommunity')}</h2>
          <p>{_('considerSubscribe', { link: <a href='https://xen-orchestra.com'>https://xen-orchestra.com</a> })}</p>
          <p className='text-danger'>{_('noUpdaterWarning')}</p>
        </div>
        : <div>
          <Row>
            <Col mediumSize={12}>
              <Card>
                <CardHeader>
                  <UpdateTag /> {states[state]}
                </CardHeader>
                <CardBlock>
                  <p>{_('currentVersion')} {`xo-server ${this.state.serverVersion}`} / {`xo-web ${pkg.version}`}</p>
                  <ActionButton
                    btnStyle='info'
                    handler={update}
                    icon='refresh'>
                    {_('refresh')}
                  </ActionButton>
                  {' '}
                  <ActionButton
                    btnStyle='success'
                    handler={upgrade}
                    icon='upgrade'>
                    {_('upgrade')}
                  </ActionButton>
                  <hr />
                  <div>
                    {map(log, (log, key) => (
                      <p key={key}>
                        <span className={textClasses[log.level]} >{log.date}</span>: <span dangerouslySetInnerHTML={{__html: ansiUp.ansi_to_html(log.message)}} />
                      </p>
                      ))}
                  </div>
                </CardBlock>
              </Card>
            </Col>
          </Row>
          <Row>
            <Col mediumSize={6}>
              <Card>
                <CardHeader>
                  {_('registration')}
                </CardHeader>
                <CardBlock>
                  <strong>{registration.state}</strong>
                  {registration.email && <span> to {registration.email}</span>}
                  <span className='text-danger'> {registration.error}</span>
                  {+XOA_PLAN === 1 &&
                    <div>
                      <h2>{_('trial')}</h2>
                      {this._trialAllowed(trial) &&
                        <div>
                          {registration.state === 'registered' &&
                            <ActionButton btnStyle='success' handler={this._startTrial} icon='trial'>{_('trialStartButton')}</ActionButton>
                          }
                        </div>
                      }
                    </div>
                  }
                  {(XOA_PLAN > 1 && XOA_PLAN < 5) &&
                    <div>
                      {this._trialAvailable(trial) &&
                        <p className='text-success'>{_('trialAvailableUntil', {date: new Date(trial.trial.end)})}</p>
                      }
                      {this._trialConsumed(trial) &&
                        <p>{_('trialConsumed')}</p>
                      }
                    </div>
                  }
                  {(XOA_PLAN < 5) &&
                    <div>
                      {trial.state === 'trustedTrial' &&
                        <p>{trial.message}</p>
                      }
                      {trial.state === 'untrustedTrial' &&
                        <p className='text-danger'>{trial.message}</p>
                      }
                    </div>
                  }
                  {XOA_PLAN < 5 &&
                    <div>
                      {this._updaterDown(trial) &&
                        <p className='text-danger'>{_('trialLocked')}</p>
                      }
                    </div>
                  }
                </CardBlock>
              </Card>
            </Col>
          </Row>
        </div>
      }
      </Container>
    </Page>
  }
}

const UpdateAlarm = () => <span className='fa-stack'>
  <i className='fa fa-circle fa-stack-2x text-danger' />
  <i className='fa fa-exclamation fa-stack-1x' />
</span>

const UpdateError = () => <span className='fa-stack'>
  <i className='fa fa-circle fa-stack-2x text-danger' />
  <i className='fa fa-question fa-stack-1x' />
</span>

const UpdateWarning = () => <span className='fa-stack'>
  <i className='fa fa-circle fa-stack-2x text-warning' />
  <i className='fa fa-question fa-stack-1x' />
</span>

const UpdateSuccess = () => <Icon icon='success' />

const UpdateAlert = () => <span className='fa-stack'>
  <i className='fa fa-circle fa-stack-2x text-success' />
  <i className='fa fa-bell fa-stack-1x' />
</span>

const RegisterAlarm = () => <Icon icon='not-registered' className='text-warning' />

export const UpdateTag = connectStore((state) => {
  return {
    configuration: state.xoaConfiguration,
    log: state.xoaUpdaterLog,
    registration: state.xoaRegisterState,
    state: state.xoaUpdaterState,
    trial: state.xoaTrialState
  }
})(props => {
  const { state } = props
  const components = {
    'disconnected': <UpdateError />,
    'connected': <UpdateWarning />,
    'upToDate': <UpdateSuccess />,
    'upgradeNeeded': <UpdateAlert />,
    'registerNeeded': <RegisterAlarm />,
    'error': <UpdateAlarm />
  }
  const tooltips = {
    'disconnected': _('noUpdateInfo'),
    'connected': _('waitingUpdateInfo'),
    'upToDate': _('upToDate'),
    'upgradeNeeded': _('mustUpgrade'),
    'registerNeeded': _('registerNeeded'),
    'error': _('updaterError')
  }
  return <Tooltip content={tooltips[state]}>{components[state]}</Tooltip>
})
