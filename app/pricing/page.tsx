import React from 'react'
import { PricingTable } from '@clerk/nextjs'

const Pricing = () => {
  return (
    <div>
        PricingPage 
        <PricingTable newSubscriptionRedirectUrl='/dashboard' />
    </div>
  )
}

export default Pricing