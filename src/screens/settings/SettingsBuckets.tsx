import { BucketManagePanel } from '../../components/BucketManagePanel'
import { SettingsSubPage } from '../../components/SettingsSubPage'

export function SettingsBuckets() {
  return (
    <SettingsSubPage
      title="Savings Buckets"
      description=""
    >
      <BucketManagePanel />
    </SettingsSubPage>
  )
}
