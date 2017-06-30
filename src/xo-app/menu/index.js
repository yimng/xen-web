import _ from 'intl'
import classNames from 'classnames'
import Component from 'base-component'
import Icon from 'icon'
import isEmpty from 'lodash/isEmpty'
import Link from 'link'
import map from 'lodash/map'
import React from 'react'
import Tooltip from 'tooltip'
import { UpdateTag } from '../xoa-updates'
import {
  addSubscriptions,
  connectStore,
  getXoaPlan,
  noop
} from 'utils'
import {
  connect,
  signOut,
  subscribePermissions,
  subscribeResourceSets
} from 'xo'
import {
  createFilter,
  createGetObjectsOfType,
  createSelector,
  getStatus,
  getUser,
  isAdmin
} from 'selectors'

import styles from './index.css'

const returnTrue = () => true

@connectStore(() => ({
  isAdmin,
  nTasks: createGetObjectsOfType('task').count(
    [ task => task.status === 'pending' ]
  ),
  pools: createGetObjectsOfType('pool'),
  nHosts: createGetObjectsOfType('host').count(),
  srs: createGetObjectsOfType('SR'),
  status: getStatus,
  user: getUser
}), {
  withRef: true
})
@addSubscriptions({
  permissions: subscribePermissions,
  resourceSets: subscribeResourceSets
})
export default class Menu extends Component {
  componentWillMount () {
    const updateCollapsed = () => {
      this.setState({ collapsed: window.innerWidth < 1200 })
    }
    updateCollapsed()

    window.addEventListener('resize', updateCollapsed)
    this._removeListener = () => {
      window.removeEventListener('resize', updateCollapsed)
      this._removeListener = noop
    }
  }

  componentWillUnmount () {
    this._removeListener()
  }

  _checkPermissions = createSelector(
    () => this.props.isAdmin,
    () => this.props.permissions,
    (isAdmin, permissions) => isAdmin
      ? returnTrue
      : ({ id }) => permissions && permissions[id] && permissions[id].operate
  )

  _getNoOperatablePools = createSelector(
    createFilter(
      () => this.props.pools,
      this._checkPermissions
    ),
    isEmpty
  )

  _getNoOperatableSrs = createSelector(
    createFilter(
      () => this.props.srs,
      this._checkPermissions
    ),
    isEmpty
  )

  _getNoResourceSets = createSelector(
    () => this.props.resourceSets,
    isEmpty
  )

  get height () {
    return this.refs.content.offsetHeight
  }

  _toggleCollapsed = event => {
    event.preventDefault()
    this._removeListener()
    this.setState({ collapsed: !this.state.collapsed })
  }

  _connect = event => {
    event.preventDefault()
    return connect()
  }

  _signOut = event => {
    event.preventDefault()
    return signOut()
  }

  render () {
    const { isAdmin, nTasks, status, user, pools, nHosts } = this.props
    const noOperatablePools = this._getNoOperatablePools()
    const noOperatableSrs = this._getNoOperatableSrs()
    const noResourceSets = this._getNoResourceSets()

    /* eslint-disable object-property-newline */
    const items = [
      { to: '/home', icon: 'menu-home', label: 'homePage', subMenu: [
        { to: '/home?t=VM', icon: 'vm', label: 'homeVmPage' },
        nHosts !== 0 && { to: '/home?t=host', icon: 'host', label: 'homeHostPage' },
        !isEmpty(pools) && { to: '/home?t=pool', icon: 'pool', label: 'homePoolPage' },
        isAdmin && { to: '/home?t=VM-template', icon: 'template', label: 'homeTemplatePage' },
        !noOperatableSrs && { to: '/home?t=SR', icon: 'sr', label: 'homeSrPage' }
      ]},
      { to: '/dashboard/overview', icon: 'menu-dashboard', label: 'dashboardPage', subMenu: [
        { to: '/dashboard/overview', icon: 'menu-dashboard-overview', label: 'overviewDashboardPage' },
        { to: '/dashboard/visualizations', icon: 'menu-dashboard-visualization', label: 'overviewVisualizationDashboardPage' },
        { to: '/dashboard/stats', icon: 'menu-dashboard-stats', label: 'overviewStatsDashboardPage' },
        { to: '/dashboard/health', icon: 'menu-dashboard-health', label: 'overviewHealthDashboardPage' }
      ]},
      isAdmin && { to: '/self', icon: 'menu-self-service', label: 'selfServicePage' },
      isAdmin && { to: '/backup/overview', icon: 'menu-backup', label: 'backupPage', subMenu: [
        { to: '/backup/overview', icon: 'menu-backup-overview', label: 'backupOverviewPage' },
        { to: '/backup/new', icon: 'menu-backup-new', label: 'backupNewPage' },
        { to: '/backup/restore', icon: 'menu-backup-restore', label: 'backupRestorePage' },
        { to: '/backup/file-restore', icon: 'menu-backup-file-restore', label: 'backupFileRestorePage' }
      ]},
      //isAdmin && { to: '/xoa-update', icon: 'menu-update', label: 'updatePage', extra: <UpdateTag /> },
      isAdmin && { to: '/settings/servers', icon: 'menu-settings', label: 'settingsPage', subMenu: [
        { to: '/settings/servers', icon: 'menu-settings-servers', label: 'settingsServersPage' },
        { to: '/settings/users', icon: 'menu-settings-users', label: 'settingsUsersPage' },
        { to: '/settings/groups', icon: 'menu-settings-groups', label: 'settingsGroupsPage' },
        { to: '/settings/acls', icon: 'menu-settings-acls', label: 'settingsAclsPage' },
        { to: '/settings/remotes', icon: 'menu-backup-remotes', label: 'backupRemotesPage' },
        { to: '/settings/plugins', icon: 'menu-settings-plugins', label: 'settingsPluginsPage' },
        { to: '/settings/logs', icon: 'menu-settings-logs', label: 'settingsLogsPage' },
        { to: '/settings/ips', icon: 'ip', label: 'settingsIpsPage' },
        { to: '/settings/config', icon: 'menu-settings-config', label: 'settingsConfigPage' }
      ]},
      /**
      isAdmin && { to: '/jobs/overview', icon: 'menu-jobs', label: 'jobsPage', subMenu: [
        { to: '/jobs/overview', icon: 'menu-jobs-overview', label: 'jobsOverviewPage' },
        { to: '/jobs/new', icon: 'menu-jobs-new', label: 'jobsNewPage' },
        { to: '/jobs/schedules', icon: 'menu-jobs-schedule', label: 'jobsSchedulingPage' }
      ]},
      **/
      //isAdmin && { to: '/about', icon: 'menu-about', label: 'aboutPage' },
      { to: '/tasks', icon: 'task', label: 'taskMenu', pill: nTasks },
      //isAdmin && { to: '/xosan', icon: 'menu-xosan', label: 'xosan' },
      !(noOperatablePools && noResourceSets) && { to: '/vms/new', icon: 'menu-new', label: 'newMenu', subMenu: [
        { to: '/vms/new', icon: 'menu-new-vm', label: 'newVmPage' },
        isAdmin && { to: '/new/sr', icon: 'menu-new-sr', label: 'newSrPage' },
        isAdmin && { to: '/settings/servers', icon: 'menu-settings-servers', label: 'newServerPage' },
        !noOperatablePools && { to: '/vms/import', icon: 'menu-new-import', label: 'newImport' }
      ]}
    ]
    /* eslint-enable object-property-newline */

    return <div className={classNames(
      'xo-menu',
      this.state.collapsed && styles.collapsed
    )}>
      <ul className='nav nav-sidebar nav-pills nav-stacked' ref='content'>
        <li>
          <span>
            <a className={styles.brand} href='#'>
              <span className={styles.hiddenUncollapsed}>VS</span>
              <span className={styles.hiddenCollapsed}>vStorage</span>
            </a>
          </span>
        </li>
        <li>
          <a className='nav-link' onClick={this._toggleCollapsed} href='#'>
            <Icon icon='menu-collapse' size='lg' fixedWidth />
          </a>
        </li>
        {map(items, (item, index) =>
          item && <MenuLinkItem key={index} item={item} />
        )}
        <li>&nbsp;</li>
        <li>&nbsp;</li>
        <li>&nbsp;</li>
        <li>&nbsp;</li>
        <li className='nav-item xo-menu-item'>
          <a className='nav-link' onClick={this._signOut} href='#'>
            <Icon icon='sign-out' size='lg' fixedWidth />
            <span className={styles.hiddenCollapsed}>{' '}{_('signOut')}</span>
          </a>
        </li>
        <li className='nav-item xo-menu-item'>
          <Link className='nav-link text-xs-center' to={'/user'}>
            <Tooltip content={_('editUserProfile', { username: user ? user.email : '' })}>
              <Icon icon='user' size='lg' />
            </Tooltip>
          </Link>
        </li>
        <li>&nbsp;</li>
        <li>&nbsp;</li>
        {status === 'connecting'
          ? <li className='nav-item text-xs-center'>{_('statusConnecting')}</li>
          : status === 'disconnected' &&
            <li className='nav-item text-xs-center xo-menu-item'>
              <a className='nav-link' onClick={this._connect} href='#'>
                <Icon icon='alarm' size='lg' fixedWidth /> {_('statusDisconnected')}
              </a>
            </li>
        }
      </ul>
    </div>
  }
}

const MenuLinkItem = props => {
  const { item } = props
  const { to, icon, label, subMenu, pill, extra } = item

  return <li className='nav-item xo-menu-item'>
    <Link activeClassName='active' className={classNames('nav-link', styles.centerCollapsed)} to={to}>
      <Icon className={classNames((pill || extra) && styles.hiddenCollapsed)} icon={`${icon}`} size='lg' fixedWidth />
      <span className={styles.hiddenCollapsed}>{' '}{_(label)}&nbsp;</span>
      {pill > 0 && <span className='tag tag-pill tag-primary'>{pill}</span>}
      {extra}
    </Link>
    {subMenu && <SubMenu items={subMenu} />}
  </li>
}

const SubMenu = props => {
  return <ul className='nav nav-pills nav-stacked xo-sub-menu'>
    {map(props.items, (item, index) => (
      item && <li key={index} className='nav-item xo-menu-item'>
        <Link activeClassName='active' className='nav-link' to={item.to}>
          <Icon icon={`${item.icon}`} size='lg' fixedWidth />
          {' '}
          {_(item.label)}
        </Link>
      </li>
    ))}
  </ul>
}
