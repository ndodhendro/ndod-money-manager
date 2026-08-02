import { isCircle, type Circle, type Owner } from './types'

const PROFILE_KEY = 'mm_profile'
const CIRCLE_KEY = 'mm_circle'

export function getStoredProfile(): Owner | null {
  const value = localStorage.getItem(PROFILE_KEY)
  return value === 'suami' || value === 'istri' ? value : null
}

export function setStoredProfile(owner: Owner): void {
  localStorage.setItem(PROFILE_KEY, owner)
}

export function clearStoredProfile(): void {
  localStorage.removeItem(PROFILE_KEY)
}

export function getStoredCircle(): Circle {
  const value = localStorage.getItem(CIRCLE_KEY)
  return isCircle(value) ? value : 'hd_family'
}

export function setStoredCircle(circle: Circle): void {
  localStorage.setItem(CIRCLE_KEY, circle)
}

const CATEGORY_USAGE_KEY = 'mm_category_usage'

type UsageMap = Record<string, number>

function readUsageMap(): UsageMap {
  try {
    const raw = localStorage.getItem(CATEGORY_USAGE_KEY)
    return raw ? (JSON.parse(raw) as UsageMap) : {}
  } catch {
    return {}
  }
}

export function bumpCategoryUsage(categoryId: string): void {
  const usage = readUsageMap()
  usage[categoryId] = (usage[categoryId] ?? 0) + 1
  localStorage.setItem(CATEGORY_USAGE_KEY, JSON.stringify(usage))
}

export function getCategoryUsage(categoryId: string): number {
  return readUsageMap()[categoryId] ?? 0
}
