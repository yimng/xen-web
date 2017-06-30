import * as ComplexMatcher from 'complex-matcher'
import * as homeFilters from 'home-filters'
import _ from 'intl'
import ActionButton from 'action-button'
import Button from 'button'
import CenterPanel from 'center-panel'
import Component from 'base-component'
import Icon from 'icon'
import invoke from 'invoke'
import Link from 'link'
import Page from '../page'
import React from 'react'
import Shortcuts from 'shortcuts'
import SingleLineRow from 'single-line-row'
import Tooltip from 'tooltip'
import { Card, CardHeader, CardBlock } from 'card'
import {
  ceil,
  debounce,
  filter,
  find,
  forEach,
  get,
  identity,
  includes,
  isEmpty,
  isString,
  keys,
  map,
  pick,
  pickBy,
  size,
  some
} from 'lodash'
import {
  addCustomFilter,
  copyVms,
  deleteTemplates,
  deleteVms,
  disconnectAllHostsSrs,
  emergencyShutdownHosts,
  forgetSrs,
  isSrShared,
  migrateVms,
  reconnectAllHostsSrs,
  rescanSrs,
  restartHosts,
  restartHostsAgents,
  restartVms,
  snapshotVms,
  startVms,
  stopHosts,
  stopVms,
  subscribeServers
} from 'xo'
import { Container, Row, Col } from 'grid'
import {
  SelectHost,
  SelectPool,
  SelectTag
} from 'select-objects'
import {
  addSubscriptions,
  connectStore,
  firstDefined,
  noop
} from 'utils'
import {
  areObjectsFetched,
  createCounter,
  createFilter,
  createGetObjectsOfType,
  createPager,
  createSelector,
  createSort,
  getUser
} from 'selectors'
import {
  DropdownButton,
  MenuItem,
  OverlayTrigger,
  Pagination,
  Popover
} from 'react-bootstrap-4/lib'

import styles from './index.css'
import HostItem from './host-item'
import PoolItem from './pool-item'
import VmItem from './vm-item'
import TemplateItem from './template-item'
import SrItem from './sr-item'

const ITEMS_PER_PAGE = 20

const OPTIONS = {
  host: {
    defaultFilter: 'power_state:running ',
    filters: homeFilters.host,
    mainActions: [
      { handler: stopHosts, icon: 'host-stop', tooltip: _('stopHostLabel') },
      { handler: restartHostsAgents, icon: 'host-restart-agent', tooltip: _('restartHostAgent') },
      { handler: emergencyShutdownHosts, icon: 'host-emergency-shutdown', tooltip: _('emergencyModeLabel') },
      { handler: restartHosts, icon: 'host-reboot', tooltip: _('rebootHostLabel') }
    ],
    Item: HostItem,
    showPoolsSelector: true,
    sortOptions: [
      { labelId: 'homeSortByName', sortBy: 'name_label', sortOrder: 'asc' },
      { labelId: 'homeSortByPowerstate', sortBy: 'power_state', sortOrder: 'desc' },
      { labelId: 'homeSortByRAM', sortBy: 'memory.size', sortOrder: 'desc' },
      { labelId: 'homeSortByCpus', sortBy: 'CPUs.cpu_count', sortOrder: 'desc' }
    ]
  },
  VM: {
    defaultFilter: 'power_state:running ',
    filters: homeFilters.VM,
    mainActions: [
      { handler: stopVms, icon: 'vm-stop', tooltip: _('stopVmLabel') },
      { handler: startVms, icon: 'vm-start', tooltip: _('startVmLabel') },
      { handler: restartVms, icon: 'vm-reboot', tooltip: _('rebootVmLabel') },
      { handler: migrateVms, icon: 'vm-migrate', tooltip: _('migrateVmLabel') },
      { handler: copyVms, icon: 'vm-copy', tooltip: _('copyVmLabel') }
    ],
    otherActions: [{
      handler: restartVms,
      icon: 'vm-force-reboot',
      labelId: 'forceRebootVmLabel',
      params: true
    }, {
      handler: stopVms,
      icon: 'vm-force-shutdown',
      labelId: 'forceShutdownVmLabel',
      params: true
    }, {
      handler: snapshotVms,
      icon: 'vm-snapshot',
      labelId: 'snapshotVmLabel'
    }, {
      handler: deleteVms,
      icon: 'vm-delete',
      labelId: 'vmRemoveButton'
    }],
    Item: VmItem,
    showPoolsSelector: true,
    showHostsSelector: true,
    sortOptions: [
      { labelId: 'homeSortByName', sortBy: 'name_label', sortOrder: 'asc' },
      { labelId: 'homeSortByPowerstate', sortBy: 'power_state', sortOrder: 'desc' },
      { labelId: 'homeSortByRAM', sortBy: 'memory.size', sortOrder: 'desc' },
      { labelId: 'homeSortByCpus', sortBy: 'CPUs.number', sortOrder: 'desc' }
    ]
  },
  pool: {
    defaultFilter: '',
    filters: homeFilters.pool,
    getActions: noop,
    Item: PoolItem,
    sortOptions: [
      { labelId: 'homeSortByName', sortBy: 'name_label', sortOrder: 'asc' }
    ]
  },
  'VM-template': {
    defaultFilter: '',
    filters: homeFilters.vmTemplate,
    mainActions: [
      { handler: deleteTemplates, icon: 'delete', tooltip: _('templateDelete') }
    ],
    Item: TemplateItem,
    showPoolsSelector: true,
    sortOptions: [
      { labelId: 'homeSortByName', sortBy: 'name_label', sortOrder: 'asc' },
      { labelId: 'homeSortByRAM', sortBy: 'memory.size', sortOrder: 'desc' },
      { labelId: 'homeSortByCpus', sortBy: 'CPUs.number', sortOrder: 'desc' }
    ]
  },
  SR: {
    defaultFilter: '',
    filters: homeFilters.SR,
    mainActions: [
      { handler: rescanSrs, icon: 'refresh', tooltip: _('srRescan') },
      { handler: reconnectAllHostsSrs, icon: 'sr-reconnect-all', tooltip: _('srReconnectAll') },
      { handler: disconnectAllHostsSrs, icon: 'sr-disconnect-all', tooltip: _('srDisconnectAll') },
      { handler: forgetSrs, icon: 'sr-forget', tooltip: _('srsForget') }
    ],
    Item: SrItem,
    showPoolsSelector: true,
    sortOptions: [
      { labelId: 'homeSortByName', sortBy: 'name_label', sortOrder: 'asc' },
      { labelId: 'homeSortBySize', sortBy: 'size', sortOrder: 'desc', default: true },
      { labelId: 'homeSortByShared', sortBy: isSrShared, sortOrder: 'desc' },
      { labelId: 'homeSortByUsage', sortBy: 'physical_usage', sortOrder: 'desc' },
      { labelId: 'homeSortByType', sortBy: 'SR_type', sortOrder: 'asc' }
    ]
  }
}

const TYPES = {
  VM: _('homeTypeVm'),
  'VM-template': _('homeTypeVmTemplate'),
  host: _('homeTypeHost'),
  pool: _('homeTypePool'),
  SR: _('homeSrPage')
}

const DEFAULT_TYPE = 'VM'

@addSubscriptions({
  servers: subscribeServers
})
@connectStore(() => {
  const noServersConnected = invoke(
    createGetObjectsOfType('host'),
    hosts => state => isEmpty(hosts(state))
  )
  const type = (_, props) => props.location.query.t || DEFAULT_TYPE

  return {
    areObjectsFetched,
    items: createGetObjectsOfType(type),
    noServersConnected,
    type,
    user: getUser
  }
})
export default class Home extends Component {
  static contextTypes = {
    router: React.PropTypes.object
  }

  state = {
    selectedItems: {}
  }

  get page () {
    return this.state.page
  }
  set page (activePage) {
    this.setState({ activePage })
  }

  componentWillMount () {
    this._initFilterAndSortBy(this.props)
  }

  componentWillReceiveProps (props) {
    if (this._getFilter() !== this._getFilter(props)) {
      this._initFilterAndSortBy(props)
    }
    if (props.type !== this.props.type) {
      this.setState({ activePage: undefined, highlighted: undefined })
    }
  }

  componentDidUpdate () {
    const { selectedItems } = this.state

    // Unselect items that are no longer visible
    if ((this._visibleItemsRecomputations || 0) < (this._visibleItemsRecomputations = this._getVisibleItems.recomputations())) {
      const newSelectedItems = pick(selectedItems, map(this._getVisibleItems(), 'id'))
      if (size(newSelectedItems) < this._getNumberOfSelectedItems()) {
        this.setState({ selectedItems: newSelectedItems })
      }
    }
  }

  _getNumberOfItems = createCounter(() => this.props.items)
  _getNumberOfSelectedItems = createCounter(
    () => this.state.selectedItems,
    [ identity ]
  )

  _getType () {
    return this.props.type
  }

  _setType (type) {
    const { pathname, query } = this.props.location
    this.context.router.push({
      pathname,
      query: { ...query, t: type, s: undefined }
    })
  }

  // Filter and sort -----------------------------------------------------------

  _getDefaultFilter (props = this.props) {
    const { type } = props
    const preferences = get(props, 'user.preferences')
    const defaultFilterName = get(preferences, [ 'defaultHomeFilters', type ])
    return firstDefined(
      defaultFilterName && firstDefined(
        get(homeFilters, [ type, defaultFilterName ]),
        get(preferences, [ 'filters', type, defaultFilterName ])
      ),
      OPTIONS[type].defaultFilter
    )
  }

  _getDefaultSort (props = this.props) {
    const sortOption = find(OPTIONS[props.type].sortOptions, 'default')

    return {
      sortBy: firstDefined(sortOption && sortOption.sortBy, 'name_label'),
      sortOrder: firstDefined(sortOption && sortOption.sortOrder, 'asc')
    }
  }

  _initFilterAndSortBy (props) {
    const filter = this._getFilter(props)

    // If filter is null, set a default filter.
    if (filter == null) {
      const defaultFilter = this._getDefaultFilter(props)

      if (defaultFilter != null) {
        this._setFilter(defaultFilter, props, true)
      }
      return
    }

    // If the filter is already set, do nothing.
    if (filter === this.props.filter) {
      return
    }

    const parsed = ComplexMatcher.parse(filter)
    const properties = parsed::ComplexMatcher.getPropertyClausesStrings()

    const sort = this._getDefaultSort(props)

    this.setState({
      selectedHosts: properties.$container,
      selectedPools: properties.$pool,
      selectedTags: properties.tags,
      ...sort
    })

    const { filterInput } = this.refs
    if (filterInput && filterInput.value !== filter) {
      filterInput.value = filter
    }
  }

  // Optionally can take the props to be able to use it in
  // componentWillReceiveProps().
  _getFilter (props = this.props) {
    return props.location.query.s
  }

  _getParsedFilter = createSelector(
    props => this._getFilter(),
    filter => ComplexMatcher.parse(filter)
  )

  _getFilterFunction = createSelector(
    this._getParsedFilter,
    filter => filter && (value => filter::ComplexMatcher.execute(value))
  )

  // Optionally can take the props to be able to use it in
  // componentWillReceiveProps().
  _setFilter (filter, props = this.props, replace) {
    if (!isString(filter)) {
      filter = filter::ComplexMatcher.toString()
    }

    const { pathname, query } = props.location
    this.context.router[replace ? 'replace' : 'push']({
      pathname,
      query: { ...query, s: filter }
    })
  }

  _clearFilter = () => this._setFilter('')

  _onFilterChange = invoke(() => {
    const setFilter = debounce(filter => {
      this._setFilter(filter)
    }, 500)

    return event => setFilter(event.target.value)
  })

  _getFilteredItems = createSort(
    createFilter(
      () => this.props.items,
      this._getFilterFunction
    ),
    () => this.state.sortBy,
    () => this.state.sortOrder
  )

  _getVisibleItems = createPager(
    this._getFilteredItems,
    () => this.state.activePage || 1,
    ITEMS_PER_PAGE
  )

  _expandAll = () => this.setState({ expandAll: !this.state.expandAll })

  _onPageSelection = (_, event) => { this.page = event.eventKey }

  _tick = isCriteria => <Icon icon={isCriteria ? 'success' : undefined} fixedWidth />

  // High level filters --------------------------------------------------------

  _typesDropdownItems = map(TYPES, (label, type) =>
    <MenuItem key={type} onClick={() => this._setType(type)}>{label}</MenuItem>
  )
  _updateSelectedPools = pools => {
    const filter = this._getParsedFilter()

    this._setFilter(pools.length
      ? filter::ComplexMatcher.setPropertyClause(
        '$pool',
        ComplexMatcher.createOr(map(pools, pool =>
          ComplexMatcher.createString(pool.id)
        ))
      )
      : filter::ComplexMatcher.removePropertyClause('$pool')
    )
  }
  _updateSelectedHosts = hosts => {
    const filter = this._getParsedFilter()

    this._setFilter(hosts.length
      ? filter::ComplexMatcher.setPropertyClause(
        '$container',
        ComplexMatcher.createOr(map(hosts, host =>
          ComplexMatcher.createString(host.id)
        ))
      )
      : filter::ComplexMatcher.removePropertyClause('$container')
    )
  }
  _updateSelectedTags = tags => {
    const filter = this._getParsedFilter()

    this._setFilter(tags.length
      ? filter::ComplexMatcher.setPropertyClause(
        'tags',
        ComplexMatcher.createOr(map(tags, tag =>
          ComplexMatcher.createString(tag.id)
        ))
      )
      : filter::ComplexMatcher.removePropertyClause('tags')
    )
  }
  _addCustomFilter = () => {
    return addCustomFilter(
      this._getType(),
      this._getFilter()
    )
  }
  _getCustomFilters () {
    const { preferences } = this.props.user || {}

    if (!preferences) {
      return
    }

    const customFilters = preferences.filters || {}
    return customFilters[this._getType()]
  }

  // Checkboxes ----------------------------------------------------------------

  _getIsAllSelected = createSelector(
    () => this.state.selectedItems,
    this._getVisibleItems,
    (selectedItems, visibleItems) =>
      size(visibleItems) > 0 && size(filter(selectedItems)) === size(visibleItems)
  )
  _getIsSomeSelected = createSelector(
    () => this.state.selectedItems,
    some
  )
  _toggleMaster = () => {
    const selectedItems = {}
    if (!this._getIsAllSelected()) {
      forEach(this._getVisibleItems(), ({ id }) => {
        selectedItems[id] = true
      })
    }
    this.setState({ selectedItems })
  }
  _getSelectedItemsIds = createSelector(
    () => this.state.selectedItems,
    items => keys(pickBy(items))
  )

  // Shortcuts -----------------------------------------------------------------

  _getShortcutsHandler = createSelector(
    () => this._getVisibleItems(),
    items => (command, event) => {
      event.preventDefault()
      switch (command) {
        case 'SEARCH':
          this.refs.filterInput.focus()
          break
        case 'NAV_DOWN':
          this.setState({ highlighted: (this.state.highlighted + items.length + 1) % items.length || 0 })
          break
        case 'NAV_UP':
          this.setState({ highlighted: (this.state.highlighted + items.length - 1) % items.length || 0 })
          break
        case 'SELECT':
          const itemId = items[this.state.highlighted].id
          this.setState({
            selectedItems: {
              ...this.state.selectedItems,
              [itemId]: !this.state.selectedItems[itemId]
            }
          })
          break
        case 'JUMP_INTO':
          const item = items[this.state.highlighted]
          if (includes(['VM', 'host', 'pool', 'SR'], item && item.type)) {
            this.context.router.push({
              pathname: `${item.type.toLowerCase()}s/${item.id}`
            })
          }
      }
    }
  )

  // Header --------------------------------------------------------------------

  _renderHeader () {
    const { type } = this.props
    const { filters } = OPTIONS[type]
    const customFilters = this._getCustomFilters()

    return <Container>
      <Row className={styles.itemRowHeader}>
        <Col mediumSize={3}>
          <DropdownButton id='typeMenu' bsStyle='info' title={TYPES[this._getType()]}>
            {this._typesDropdownItems}
          </DropdownButton>
        </Col>
        <Col mediumSize={6}>
          <div className='input-group'>
            {!isEmpty(filters) && (
              <div className='input-group-btn'>
                <DropdownButton id='filter' bsStyle='info' title={_('homeFilters')}>
                  {!isEmpty(customFilters) && [
                    map(customFilters, (filter, name) =>
                      <MenuItem key={`custom-${name}`} onClick={() => this._setFilter(filter)}>
                        {name}
                      </MenuItem>
                    ),
                    <MenuItem divider />
                  ]}
                  {map(filters, (filter, label) =>
                    <MenuItem key={label} onClick={() => this._setFilter(filter)}>
                      {_(label)}
                    </MenuItem>
                  )}
                </DropdownButton>
              </div>
            )}
            <input
              className='form-control'
              defaultValue={this._getFilter()}
              onChange={this._onFilterChange}
              ref='filterInput'
              type='text'
            />
            <div className='input-group-btn'>
              <Button onClick={this._clearFilter}>
                <Icon icon='clear-search' />
              </Button>
            </div>
            <div className='input-group-btn'>
              <ActionButton
                btnStyle='primary'
                handler={this._addCustomFilter}
                icon='save'
              />
            </div>
          </div>
        </Col>
        <Col mediumSize={3} className='text-xs-right'>
          <Link
            className='btn btn-success'
            to='/vms/new'>
            <Icon icon='vm-new' /> {_('homeNewVm')}
          </Link>
        </Col>
      </Row>
    </Container>
  }

  // ---------------------------------------------------------------------------

  render () {
    const {
      areObjectsFetched,
      noServersConnected,
      servers,
      user
    } = this.props

    const isAdmin = user && user.permission === 'admin'
    const noRegisteredServers = !servers || !servers.length

    if (!areObjectsFetched) {
      return <CenterPanel>
        <h2><img src='assets/loading.svg' /></h2>
      </CenterPanel>
    }

    if (noServersConnected && isAdmin) {
      return <CenterPanel>
        <Card shadow>
          <CardHeader>{_('homeWelcome')}</CardHeader>
          <CardBlock>
            <Link to='/settings/servers'>
              <Icon icon='pool' size={4} />
              <h4>{noRegisteredServers ? _('homeAddServer') : _('homeConnectServer')}</h4>
            </Link>
            <p className='text-muted'>{noRegisteredServers ? _('homeWelcomeText') : _('homeConnectServerText')}</p>
            <br /><br />
          </CardBlock>
        </Card>
      </CenterPanel>
    }

    const nItems = this._getNumberOfItems()
    if (!nItems) {
      return <CenterPanel>
        <Card shadow>
          <CardHeader>{_('homeNoVms')}</CardHeader>
          <CardBlock>
            <Row>
              <Col>
                <Link to='/vms/new'>
                  <Icon icon='vm' size={4} />
                  <h4>{_('homeNewVm')}</h4>
                </Link>
                <p className='text-muted'>{_('homeNewVmMessage')}</p>
              </Col>
            </Row>
            {isAdmin && <div>
              <h2>{_('homeNoVmsOr')}</h2>
              <Row>
                <Col mediumSize={6}>
                  <Link to='/import'>
                    <Icon icon='menu-new-import' size={4} />
                    <h4>{_('homeImportVm')}</h4>
                  </Link>
                  <p className='text-muted'>{_('homeImportVmMessage')}</p>
                </Col>
                <Col mediumSize={6}>
                  <Link to='/backup/restore'>
                    <Icon icon='backup' size={4} />
                    <h4>{_('homeRestoreBackup')}</h4>
                  </Link>
                  <p className='text-muted'>{_('homeRestoreBackupMessage')}</p>
                </Col>
              </Row>
            </div>}
          </CardBlock>
        </Card>
      </CenterPanel>
    }

    const filteredItems = this._getFilteredItems()
    const visibleItems = this._getVisibleItems()

    const {
      activePage,
      expandAll,
      highlighted,
      selectedHosts,
      selectedItems,
      selectedPools,
      selectedTags,
      sortBy
    } = this.state
    const {
      items,
      type
    } = this.props

    const options = OPTIONS[type]
    const {
      Item,
      mainActions,
      otherActions,
      showHostsSelector,
      showPoolsSelector
    } = options

    // Necessary because indeterminate cannot be used as an attribute
    if (this.refs.masterCheckbox) {
      this.refs.masterCheckbox.indeterminate = this._getIsSomeSelected() && !this._getIsAllSelected()
    }

    return <Page header={this._renderHeader()}>
      <Shortcuts name='Home' handler={this._getShortcutsHandler()} targetNodeSelector='body' stopPropagation={false} />
      <div>
        <div className={styles.itemContainer}>
          <SingleLineRow className={styles.itemContainerHeader}>
            <Col smallsize={11} mediumSize={3}>
              <input
                checked={this._getIsAllSelected()}
                onChange={this._toggleMaster}
                ref='masterCheckbox'
                type='checkbox'
              />
              {' '}
              <span className='text-muted'>
                {this._getNumberOfSelectedItems()
                 ? _('homeSelectedItems', {
                   icon: <Icon icon={type.toLowerCase()} />,
                   selected: this._getNumberOfSelectedItems(),
                   total: nItems
                 })
                 : _('homeDisplayedItems', {
                   displayed: filteredItems.length,
                   icon: <Icon icon={type.toLowerCase()} />,
                   total: nItems
                 })
                }
              </span>
            </Col>
            <Col mediumSize={8} className='text-xs-right hidden-sm-down'>
              {this._getNumberOfSelectedItems()
                ? (
                  <div>
                    {mainActions && <div className='btn-group'>
                      {map(mainActions, (action, key) => (
                        <Tooltip content={action.tooltip} key={key}>
                          <ActionButton
                            {...action}
                            handlerParam={this._getSelectedItemsIds()}
                          />
                        </Tooltip>
                      ))}
                    </div>}
                    {otherActions && (
                    <DropdownButton bsStyle='secondary' id='advanced' title={_('homeMore')}>
                      {map(otherActions, (action, key) => (
                        <MenuItem key={key} onClick={() => { action.handler(this._getSelectedItemsIds(), action.params) }}>
                          <Icon icon={action.icon} fixedWidth /> {_(action.labelId)}
                        </MenuItem>
                      ))}
                    </DropdownButton>
                  )}
                  </div>
                ) : <div>
                  {showPoolsSelector && (
                    <OverlayTrigger
                      trigger='click'
                      rootClose
                      placement='bottom'
                      overlay={
                        <Popover className={styles.selectObject} id='poolPopover'>
                          <SelectPool
                            autoFocus
                            multi
                            onChange={this._updateSelectedPools}
                            value={selectedPools}
                          />
                        </Popover>
                      }
                    >
                      <Button btnStyle='link'><Icon icon='pool' /> {_('homeAllPools')}</Button>
                    </OverlayTrigger>
                  )}
                  {' '}
                  {showHostsSelector && (
                    <OverlayTrigger
                      trigger='click'
                      rootClose
                      placement='bottom'
                      overlay={
                        <Popover className={styles.selectObject} id='HostPopover'>
                          <SelectHost
                            autoFocus
                            multi
                            onChange={this._updateSelectedHosts}
                            value={selectedHosts}
                          />
                        </Popover>
                      }
                    >
                      <Button btnStyle='link'><Icon icon='host' /> {_('homeAllHosts')}</Button>
                    </OverlayTrigger>
                  )}
                  {' '}
                  <OverlayTrigger
                    autoFocus
                    trigger='click'
                    rootClose
                    placement='bottom'
                    overlay={
                      <Popover className={styles.selectObject} id='tagPopover'>
                        <SelectTag
                          autoFocus
                          multi
                          objects={items}
                          onChange={this._updateSelectedTags}
                          value={selectedTags}
                        />
                      </Popover>
                    }
                  >
                    <Button btnStyle='link'><Icon icon='tags' /> {_('homeAllTags')}</Button>
                  </OverlayTrigger>
                  {' '}
                  <DropdownButton bsStyle='link' id='sort' title={_('homeSortBy')}>
                    {map(options.sortOptions, ({ labelId, sortBy: _sortBy, sortOrder }, key) => (
                      <MenuItem key={key} onClick={() => this.setState({ sortBy: _sortBy, sortOrder })}>
                        {this._tick(_sortBy === sortBy)}
                        {_sortBy === sortBy
                          ? <strong>{_(labelId)}</strong>
                          : _(labelId)
                        }
                      </MenuItem>
                    ))}
                  </DropdownButton>
                </div>
              }
            </Col>
            <Col smallsize={1} mediumSize={1} className='text-xs-right'>
              <Button onClick={this._expandAll}>
                <Icon icon='nav' />
              </Button>
            </Col>
          </SingleLineRow>
          {isEmpty(filteredItems)
            ? <p className='text-xs-center mt-1'>
              <a className='btn btn-link' onClick={this._clearFilter}>
                <Icon icon='info' /> {_('homeNoMatches')}
              </a>
            </p>
            : map(visibleItems, (item, index) => (
              <div key={item.id} className={highlighted === index && styles.highlight}>
                <Item
                  expandAll={expandAll}
                  item={item}
                  key={item.id}
                  onSelect={this.toggleState(`selectedItems.${item.id}`)}
                  selected={selectedItems[item.id]}
                />
              </div>
            ))
          }
        </div>
        {filteredItems.length > ITEMS_PER_PAGE && <Row>
          <div style={{display: 'flex', width: '100%'}}>
            <div style={{margin: 'auto'}}>
              <Pagination
                first
                last
                prev
                next
                ellipsis
                boundaryLinks
                maxButtons={5}
                items={ceil(filteredItems.length / ITEMS_PER_PAGE)}
                activePage={activePage}
                onSelect={this._onPageSelection} />
            </div>
          </div>
        </Row>}
      </div>
    </Page>
  }
}
