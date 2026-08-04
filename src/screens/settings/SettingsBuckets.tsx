import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { BucketManagePanel } from '../../components/BucketManagePanel'
import { SettingsSubPage } from '../../components/SettingsSubPage'
import { dismissNumericKeyboard } from '../../lib/keyboardFocus'
import { SettingsIcon } from '../../lib/settingsSections'

export function SettingsBuckets() {
  const navigate = useNavigate()
  const location = useLocation()
  const { bucketId } = useParams<{ bucketId?: string }>()
  const backToListRef = useRef<(() => void) | null>(null)

  const isNew = location.pathname === '/pengaturan/buckets/new'
  const editId = bucketId && bucketId !== 'new' ? bucketId : null
  const inForm = isNew || editId != null

  const title = !inForm
    ? 'Savings Buckets'
    : editId
      ? 'Edit Bucket'
      : 'Add Bucket'

  const goList = useCallback(() => {
    dismissNumericKeyboard()
    backToListRef.current?.()
    navigate('/pengaturan/buckets', { replace: true })
  }, [navigate])

  // Phone Back navigates to list route → sync panel UI.
  useEffect(() => {
    if (!inForm) {
      backToListRef.current?.()
    }
  }, [inForm])

  const handleViewChange = useCallback(
    (info: {
      view: 'list' | 'form'
      editing: boolean
      editingId: string | null
    }) => {
      if (info.view === 'form') {
        if (info.editingId) {
          if (editId !== info.editingId) {
            navigate(`/pengaturan/buckets/${info.editingId}`, {
              replace: true,
            })
          }
        } else if (!isNew) {
          navigate('/pengaturan/buckets/new', { replace: true })
        }
        return
      }
      // Panel left the form (save / cancel). Sync URL only when it still
      // points at the form — avoids fighting phone-Back navigation.
      if (inForm) {
        navigate('/pengaturan/buckets', { replace: true })
      }
    },
    [editId, inForm, isNew, navigate],
  )

  return (
    <SettingsSubPage
      title={title}
      icon={SettingsIcon.buckets}
      onBack={inForm ? goList : undefined}
    >
      <BucketManagePanel
        onViewChange={handleViewChange}
        backToListRef={backToListRef}
        routeEditId={editId}
        routeWantForm={inForm}
      />
    </SettingsSubPage>
  )
}
