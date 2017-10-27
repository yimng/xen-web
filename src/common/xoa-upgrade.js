import React from 'react'

import _ from './intl'
import Icon from './icon'
import Link from './link'
import propTypes from './prop-types-decorator'
import { Card, CardHeader, CardBlock } from './card'
import { connectStore, getXoaPlan } from './utils'
import { isAdmin } from 'selectors'
import xoaUpdater, { XOA_PLAN } from 'xoa-updater'
import Button from 'button'
import {applyLicense} from 'xo'

if (+XOA_PLAN < 5) {
  xoaUpdater.start()
}

const Upgrade = propTypes({
  available: propTypes.number,
  place: propTypes.string.isRequired,
  required: propTypes.number
})(connectStore({
  isAdmin
}))(({
  available,
  children,
  isAdmin,
  place,
  required = available
}) => XOA_PLAN < required
  ? <Card>
    <CardHeader>{_('upgradeNeeded')}</CardHeader>
    {isAdmin
      ? <CardBlock className='text-xs-center'>
        <p>{_('availableIn', {plan: getXoaPlan(required)})}</p>
        <p>
          <Button btnStyle='primary' onClick={applyLicense}>{_('requestLicense')}</Button>
          {_('or')}&nbsp;
          <Link className='btn btn-success btn-lg' to={'/xoa-update'}>
            <Icon icon='plan-trial' /> {_('tryIt')}
          </Link>
        </p>
      </CardBlock>
      : <CardBlock className='text-xs-center'>
        <p>{_('notAvailable')}</p>
      </CardBlock>
    }
  </Card>
  : children
)

export { Upgrade as default }
