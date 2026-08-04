import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CategoryManagePanel } from '../../components/CategoryManagePanel'
import { SettingsSubPage } from '../../components/SettingsSubPage'
import { dismissNumericKeyboard } from '../../lib/keyboardFocus'
import { SettingsIcon } from '../../lib/settingsSections'
import type { CategoryType } from '../../lib/types'

export function SettingsCategories() {
  const navigate = useNavigate()
  const location = useLocation()
  const backToListRef = useRef<(() => void) | null>(null)
  const [manageType, setManageType] = useState<CategoryType>('expense')

  const isNew = location.pathname === '/pengaturan/categories/new'
  const inForm = isNew

  const title = inForm ? 'Add Category' : 'Categories'

  const goList = useCallback(() => {
    dismissNumericKeyboard()
    backToListRef.current?.()
    navigate('/pengaturan/categories', { replace: true })
  }, [navigate])

  // Phone Back navigates to list route → sync panel UI.
  useEffect(() => {
    if (!inForm) {
      backToListRef.current?.()
    }
  }, [inForm])

  const handleViewChange = useCallback(
    (info: { view: 'list' | 'form' }) => {
      if (info.view === 'form') {
        if (!isNew) {
          navigate('/pengaturan/categories/new', { replace: true })
        }
        return
      }
      if (inForm) {
        navigate('/pengaturan/categories', { replace: true })
      }
    },
    [inForm, isNew, navigate],
  )

  return (
    <SettingsSubPage
      title={title}
      icon={SettingsIcon.categories}
      onBack={inForm ? goList : undefined}
    >
      <CategoryManagePanel
        type={manageType}
        allowTypeChange
        onTypeChange={setManageType}
        onChanged={() => {}}
        onViewChange={handleViewChange}
        backToListRef={backToListRef}
        routeWantForm={inForm}
      />
    </SettingsSubPage>
  )
}
