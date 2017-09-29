import * as FormGrid from 'form-grid'
import _ from 'intl'
import ActionButton from 'action-button'
import Button from 'button'
import Component from 'base-component'
import Dropzone from 'dropzone'
import Icon from 'icon'
import isEmpty from 'lodash/isEmpty'
import map from 'lodash/map'
import orderBy from 'lodash/orderBy'
import propTypes from 'prop-types-decorator'
import React from 'react'
import Upgrade from 'xoa-upgrade'
import { Container, Col, Row } from 'grid'
import { importVms, isSrWritable } from 'xo'
import { SizeInput } from 'form'
import {
  createFinder,
  createGetObject,
  createGetObjectsOfType,
  createSelector
} from 'selectors'
import {
  connectStore,
  formatSize,
  mapPlus,
  noop
} from 'utils'
import {
  SelectNetwork,
  SelectPool,
  SelectSr
} from 'select-objects'

import Page from '../page'
import parseOvaFile from './ova'

import styles from './index.css'

// ===================================================================

const FORMAT_TO_HANDLER = {
  ova: parseOvaFile,
  xva: noop
}

const HEADER = (
  <Container>
    <Row>
      <Col>
        <h2><Icon icon='import' /> {_('newImport')}</h2>
      </Col>
    </Row>
  </Container>
)

// ===================================================================

@propTypes({
  descriptionLabel: propTypes.string,
  disks: propTypes.objectOf(
    propTypes.shape({
      capacity: propTypes.number.isRequired,
      descriptionLabel: propTypes.string.isRequired,
      nameLabel: propTypes.string.isRequired,
      path: propTypes.string.isRequired
    })
  ),
  memory: propTypes.number,
  nameLabel: propTypes.string,
  nCpus: propTypes.number,
  networks: propTypes.array,
  pool: propTypes.object.isRequired
})
@connectStore(() => {
  const getHostMaster = createGetObject(
    (_, props) => props.pool.master
  )
  const getPifs = createGetObjectsOfType('PIF').pick(
    (state, props) => getHostMaster(state, props).$PIFs
  )
  const getDefaultNetworkId = createSelector(
    createFinder(
      getPifs,
      [ pif => pif.management ]
    ),
    pif => pif.$network
  )

  return {
    defaultNetwork: getDefaultNetworkId
  }
}, { withRef: true })
class VmData extends Component {
  get value () {
    const { props, refs } = this
    return {
      descriptionLabel: refs.descriptionLabel.value,
      disks: map(props.disks, ({ capacity, path, position }, diskId) => ({
        capacity,
        descriptionLabel: refs[`disk-description-${diskId}`].value,
        nameLabel: refs[`disk-name-${diskId}`].value,
        path,
        position
      })),
      memory: +refs.memory.value,
      nameLabel: refs.nameLabel.value,
      networks: map(props.networks, (_, networkId) => {
        const network = refs[`network-${networkId}`].value
        return network.id ? network.id : network
      }),
      nCpus: +refs.nCpus.value
    }
  }

  _getNetworkPredicate = createSelector(
    () => this.props.pool.id,
    id => network => network.$pool === id
  )

  render () {
    const {
      descriptionLabel,
      defaultNetwork,
      disks,
      memory,
      nameLabel,
      nCpus,
      networks
    } = this.props

    return (
      <div>
        <Row>
          <Col mediumSize={6}>
            <div className='form-group'>
              <label>{_('vmNameLabel')}</label>
              <input className='form-control' ref='nameLabel' defaultValue={nameLabel} type='text' required />
            </div>
            <div className='form-group'>
              <label>{_('vmNameDescription')}</label>
              <input className='form-control' ref='descriptionLabel' defaultValue={descriptionLabel} type='text' required />
            </div>
          </Col>
          <Col mediumSize={6}>
            <div className='form-group'>
              <label>{_('nCpus')}</label>
              <input className='form-control' ref='nCpus' defaultValue={nCpus} type='number' required />
            </div>
            <div className='form-group'>
              <label>{_('vmMemory')}</label>
              <SizeInput defaultValue={memory} ref='memory' required />
            </div>
          </Col>
        </Row>
        <Row>
          <Col mediumSize={6}>
            {!isEmpty(disks)
              ? map(disks, (disk, diskId) => (
                <Row key={diskId}>
                  <Col mediumSize={6}>
                    <div className='form-group'>
                      <label>
                        {_('diskInfo', {
                          position: `${disk.position}`,
                          capacity: formatSize(disk.capacity)
                        })}
                      </label>
                      <input className='form-control' ref={`disk-name-${diskId}`} defaultValue={disk.nameLabel} type='text' required />
                    </div>
                  </Col>
                  <Col mediumSize={6}>
                    <div className='form-group'>
                      <label>{_('diskDescription')}</label>
                      <input className='form-control' ref={`disk-description-${diskId}`} defaultValue={disk.descriptionLabel} type='text' required />
                    </div>
                  </Col>
                </Row>
              )) : _('noDisks')
            }
          </Col>
          <Col mediumSize={6}>
            {networks.length > 0
              ? map(networks, (name, networkId) => (
                <div className='form-group' key={networkId}>
                  <label>{_('networkInfo', { name })}</label>
                  <SelectNetwork defaultValue={defaultNetwork} ref={`network-${networkId}`} predicate={this._getNetworkPredicate()} />
                </div>
              )) : _('noNetworks')
            }
          </Col>
        </Row>
      </div>
    )
  }
}

// ===================================================================

const parseFile = async (file, type, func) => {
  try {
    return {
      data: await func(file),
      file,
      type
    }
  } catch (error) {
    return { error, file, type }
  }
}

export default class Import extends Component {
  constructor (props) {
    super(props)
    this.state.vms = []
  }

  _import = () => {
    const { state } = this
    return importVms(
      mapPlus(state.vms, (vm, push, vmIndex) => {
        if (!vm.error) {
          const ref = this.refs[`vm-data-${vmIndex}`]
          push({
            ...vm,
            data: ref && ref.value
          })
        }
      }),
      state.sr
    )
  }

  _handleDrop = async files => {
    const vms = await Promise.all(mapPlus(files, (file, push) => {
      const { name } = file
      const extIndex = name.lastIndexOf('.')

      let func
      let type

      if (
        extIndex >= 0 &&
        (type = name.substring(extIndex + 1)) &&
        (func = FORMAT_TO_HANDLER[type])
      ) {
        push(parseFile(file, type, func))
      }
    }))

    this.setState({
      vms: orderBy(vms, vm => [ vm.error != null, vm.type, vm.file.name ])
    })
  }

  _handleCleanSelectedVms = () => {
    this.setState({
      vms: []
    })
  }

  _handleSelectedPool = pool => {
    if (pool === '') {
      this.setState({
        pool: undefined,
        sr: undefined,
        srPredicate: undefined
      })
    } else {
      this.setState({
        pool,
        sr: pool.default_SR,
        srPredicate: sr => sr.$pool === this.state.pool.id && isSrWritable(sr)
      })
    }
  }

  _handleSelectedSr = sr => {
    this.setState({
      sr: sr === '' ? undefined : sr
    })
  }

  render () {
    const {
      pool,
      sr,
      srPredicate,
      vms
    } = this.state

    return <Page header={HEADER} title='newImport' formatTitle>
      {global.XOA_PLAN > 1
        ? (
          <Container>
            <form id='import-form'>
              <FormGrid.Row>
                <FormGrid.LabelCol>{_('vmImportToPool')}</FormGrid.LabelCol>
                <FormGrid.InputCol>
                  <SelectPool value={pool} onChange={this._handleSelectedPool} required />
                </FormGrid.InputCol>
              </FormGrid.Row>
              <FormGrid.Row>
                <FormGrid.LabelCol>{_('vmImportToSr')}</FormGrid.LabelCol>
                <FormGrid.InputCol>
                  <SelectSr
                    disabled={!pool}
                    onChange={this._handleSelectedSr}
                    predicate={srPredicate}
                    required
                    value={sr}
                  />
                </FormGrid.InputCol>
              </FormGrid.Row>
              {sr && (
              <div>
                <Dropzone onDrop={this._handleDrop} message={_('importVmsList')} />
                <hr />
                <h5>{_('vmsToImport')}</h5>
                {vms.length > 0
                  ? (
                    <div>
                      {map(vms, ({ data, error, file, type }, vmIndex) => (
                        <div key={file.preview} className={styles.vmContainer}>
                          <strong>{file.name}</strong>
                          <span className='pull-right'>
                            <strong>{`(${formatSize(file.size)})`}</strong>
                          </span>
                          {!error
                            ? (data &&
                              <div>
                                <hr />
                                <div className='alert alert-info' role='alert'>
                                  <strong>{_('vmImportFileType', { type })}</strong> {_('vmImportConfigAlert')}
                                </div>
                                <VmData {...data} ref={`vm-data-${vmIndex}`} pool={pool} />
                              </div>
                            ) : (
                              <div>
                                <hr />
                                <div className='alert alert-danger' role='alert'>
                                  <strong>{_('vmImportError')}</strong> {(error && error.message) || _('noVmImportErrorDescription')}
                                </div>
                              </div>
                            )
                        }
                        </div>
                    ))}
                    </div>
                  ) : <p>{_('noSelectedVms')}</p>
                }
                <hr />
                <div className='form-group pull-right'>
                  <ActionButton
                    btnStyle='primary'
                    disabled={!vms.length}
                    className='mr-1'
                    form='import-form'
                    handler={this._import}
                    icon='import'
                    redirectOnSuccess='/'
                    type='submit'
                  >
                    {_('newImport')}
                  </ActionButton>
                  <Button
                    onClick={this._handleCleanSelectedVms}
                  >
                    {_('importVmsCleanList')}
                  </Button>
                </div>
              </div>
            )}
            </form>
          </Container>
      ) : <Container><Upgrade place='vmImport' available={2} /></Container>
    }
    </Page>
  }
}
