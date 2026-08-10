import { useCallback, useEffect, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { RecurringBillsPanel } from '../../components/RecurringBillsPanel'
import { SettingsSubPage } from '../../components/SettingsSubPage'
import { dismissNumericKeyboard } from '../../lib/keyboardFocus'
import { SettingsIcon } from '../../lib/settingsSections'

export function SettingsRecurring() {
  const navigate = useNavigate()
  const location = useLocation()
  const { billId } = useParams<{ billId?: string }>()
  const backToListRef = useRef<(() => void) | null>(null)

  const isNew = location.pathname === '/pengaturan/recurring/new'
  const editId = billId && billId !== 'new' ? billId : null
  const inForm = isNew || editId != null

  const title = !inForm
    ? 'Monthly Estimates'
    : editId
      ? 'Edit Estimate'
      : 'Add Estimate'

  const goList = useCallback(() => {
    dismissNumericKeyboard()
    backToListRef.current?.()
    navigate('/pengaturan/recurring', { replace: true })
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
            navigate(`/pengaturan/recurring/${info.editingId}`, {
              replace: true,
            })
          }
        } else if (!isNew) {
          navigate('/pengaturan/recurring/new', { replace: true })
        }
        return
      }
      // Panel left the form (save / cancel). Sync URL only when it still
      // points at the form — avoids fighting phone-Back navigation.
      if (inForm) {
        navigate('/pengaturan/recurring', { replace: true })
      }
    },
    [editId, inForm, isNew, navigate],
  )

  return (
    <SettingsSubPage
      title={title}
      icon={SettingsIcon.recurring}
      onBack={inForm ? goList : undefined}
    >
      <RecurringBillsPanel
        onViewChange={handleViewChange}
        backToListRef={backToListRef}
        routeEditId={editId}
        routeWantForm={inForm}
      />
    </SettingsSubPage>
  )
}
