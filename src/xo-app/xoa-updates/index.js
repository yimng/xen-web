import _, { messages } from 'intl'
import ActionButton from 'action-button'
import ansiUp from 'ansi_up'
import assign from 'lodash/assign'
import Button from 'button'
import Dropzone from 'dropzone'
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
import { serverVersion, importLicense } from 'xo'

import pkg from '../../../package'
import { XOA_PLAN } from 'xoa-updater'
import {
  formatSize
} from 'utils'



const HEADER = <Container>
  <h2><Icon icon='menu-update' /> {_('LicensePage')}</h2>
</Container>

// FIXME: can't translate
const states = {
  free: 'Free',
  upToDate: 'Up to Date',
  upgradeNeeded: 'Upgrade required',
  error: 'An error occured'
}

const update = () => xoaUpdater.update()

@connectStore((state) => {
  return {
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

  componentWillMount () {
    this.setState({ askRegisterAgain: false, importStatus: 'noFile' })
    serverVersion.then(serverVersion => {
      this.setState({ serverVersion })
    })
    update()
  }

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

  _importLicense = () => {
    this.setState({ importStatus: 'start' }, () =>
      importLicense(this.state.configFile).then(
        (response) => {
          this.setState({ configFile: undefined, importStatus: response.statusText })
          update()
        },
        (error) => {
          this.setState({ configFile: undefined, importStatus: 'importError'})
        }
      )
    )
  }

  _handleDrop = files =>
    this.setState({
      configFile: files && files[0],
      importStatus: 'selectedFile'
    })

  _unselectFile = () => this.setState({ configFile: undefined, importStatus: 'noFile' })

  _renderImportStatus = () => {
    const { configFile, importStatus } = this.state

    switch (importStatus) {
      case 'noFile':
        return _('noLicenseFile')
      case 'selectedFile':
        return <span>{`${configFile.name} (${formatSize(configFile.size)})`}</span>
      case 'start':
        return <Icon icon='loading' />
      case 'OK':
        return <span className='text-success'>{_('importLicenseSuccess')}</span>
      case 'invalidsig':
        return <span className='text-danger'>{('invalid signature')}</span>
      case 'invalidfinger':
        return <span className='text-danger'>{('invalid finger print')}</span>
      case 'untrusted':
        return <span className='text-danger'>{('license is untrusted')}</span>
      case 'importError':
        return <span className='text-danger'>{_('importLicenseError')}</span>
      default:
        return <span className='text-danger'>{('Unknow error')}</span>
    }
  }

  render () {
    const { configFile } = this.state
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
                  <Icon icon='import' /> {_('importLicense')}
                </CardHeader>
                <CardBlock>
                  <div className='mb-1'>
                    <form id='import-form'>
                      <Dropzone onDrop={this._handleDrop} message={_('importLicenseTip')} />
                      {this._renderImportStatus()}
                      <div className='form-group pull-right'>
                        <ActionButton
                          btnStyle='primary'
                          className='mr-1'
                          disabled={!configFile}
                          form='import-form'
                          handler={this._importLicense}
                          icon='import'
                          type='submit'
                        >
                          {_('importConfig')}
                        </ActionButton>
                        <Button
                          onClick={this._unselectFile}
                        >
                          {_('importVmsCleanList')}
                        </Button>
                      </div>
                    </form>
                  </div>
                </CardBlock>
              </Card>
            </Col>
          </Row>
          <Row>
            <Col mediumSize={6}>
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
            <Col mediumSize={6}>
              <Card>
                <CardHeader>
                  {_('licenseinfo')}
                </CardHeader>
                <CardBlock>
                  <strong>{registration.state}</strong>
                  {registration.email && <span> to {registration.email}</span>}
                  <span className='text-danger'> {registration.error}</span>
                  {+XOA_PLAN === 1 &&
                    <div>
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
    log: state.xoaUpdaterLog,
    registration: state.xoaRegisterState,
    state: state.xoaUpdaterState,
    trial: state.xoaTrialState
  }
})(props => {
  const { state } = props
  const components = {
    'free': <UpdateError />,
    'updating': <UpdateWarning />,
    'upToDate': <UpdateSuccess />,
    'upgradeNeeded': <UpdateAlert />,
    'registerNeeded': <RegisterAlarm />,
    'error': <UpdateAlarm />
  }
  const tooltips = {
    'free': _('noUpdateInfo'),
    'updating': _('waitingUpdateInfo'),
    'upToDate': _('upToDate'),
    'upgradeNeeded': _('mustUpgrade'),
    'registerNeeded': _('registerNeeded'),
    'error': _('updaterError')
  }
  return <Tooltip content={tooltips[state]}>{components[state]}</Tooltip>
})
