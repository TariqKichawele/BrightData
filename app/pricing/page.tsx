import React from 'react'
import { PricingTable } from '@clerk/nextjs'

const Pricing = () => {
  return (
    <div>
        <PricingTable newSubscriptionRedirectUrl='/dashboard' />
    </div>
  )
}

export default Pricing