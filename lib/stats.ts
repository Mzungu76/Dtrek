import { ActivityMeta } from './blobStore'
import { format } from 'date-fns'

export function formatPaceMinkm(distanceM: number, totalSec: number): string {
  if (distanceM <= 0) return '--'
  const secPerKm = totalSec / (distanceM / 1000)
  const m = Math.floor(secPerKm / 60)
  const s = Math.floor(secPerKm % 60)
  return `${m}'${s.toString().padStart(2, '0')}"/km`
}

export function difficultyIndex(elevGainM: number, distanceM: number): number {
  if (distanceM <= 0) return 0
  return Math.round(elevGainM / (distanceM / 1000))
}

export function caloriesPerHour(calories: number, totalSec: number): number {
  if (totalSec <= 0) return 0
  return Math.round(calories / (totalSec / 3600))
}

export interface PersonalRecords {
  longestKm: ActivityMeta | null
  highestGain: ActivityMeta | null
  fastestPace: ActivityMeta | null
  mostCalories: ActivityMeta | null
  highestAlt: ActivityMeta | null
  longestDuration: ActivityMeta | null
  highestHR: ActivityMeta | null
  highestDifficulty: ActivityMeta | null
}

export function getPersonalRecords(activities: ActivityMeta[]): PersonalRecords {
  if (activities.length === 0) {
    return {
      longestKm: null, highestGain: null, fastestPace: null, mostCalories: null,
      highestAlt: null, longestDuration: null, highestHR: null, highestDifficulty: null,
    }
  }
  const withDist = activities.filter(a => a.distanceMeters > 0)
  return {
    longestKm: activities.reduce((a, b) => a.distanceMeters > b.distanceMeters ? a : b),
    highestGain: activities.reduce((a, b) => a.elevationGain > b.elevationGain ? a : b),
    fastestPace: withDist.length > 0
      ? withDist.reduce((a, b) =>
          (a.totalTimeSeconds / a.distanceMeters) < (b.totalTimeSeconds / b.distanceMeters) ? a : b)
      : null,
    mostCalories: activities.reduce((a, b) => a.calories > b.calories ? a : b),
    highestAlt: activities.reduce((a, b) => a.altitudeMax > b.altitudeMax ? a : b),
    longestDuration: activities.reduce((a, b) => a.totalTimeSeconds > b.totalTimeSeconds ? a : b),
    highestHR: activities.reduce((a, b) => a.maxHeartRate > b.maxHeartRate ? a : b),
    highestDifficulty: withDist.length > 0
      ? withDist.reduce((a, b) =>
          difficultyIndex(a.elevationGain, a.distanceMeters) > difficultyIndex(b.elevationGain, b.distanceMeters) ? a : b)
      : null,
  }
}

export interface Streaks {
  currentDays: number
  longestDays: number
  currentWeeks: number
  longestWeeks: number
  totalActiveDays: number
  totalActiveWeeks: number
}

function getMondayStr(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return format(d, 'yyyy-MM-dd')
}

export function computeStreaks(activities: ActivityMeta[]): Streaks {
  if (activities.length === 0) {
    return { currentDays: 0, longestDays: 0, currentWeeks: 0, longestWeeks: 0, totalActiveDays: 0, totalActiveWeeks: 0 }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayStr = format(today, 'yyyy-MM-dd')

  const activeDays = new Set(activities.map(a => format(new Date(a.startTime), 'yyyy-MM-dd')))
  const activeWeeks = new Set(activities.map(a => getMondayStr(new Date(a.startTime))))

  // Current day streak
  let currentDays = 0
  let d = new Date(today)
  while (activeDays.has(format(d, 'yyyy-MM-dd'))) {
    currentDays++
    d.setDate(d.getDate() - 1)
  }

  // Longest day streak
  const sortedDays = Array.from(activeDays).sort()
  let longestDays = 0, cur = 0
  for (let i = 0; i < sortedDays.length; i++) {
    if (i === 0) { cur = 1; longestDays = 1; continue }
    const prev = new Date(sortedDays[i - 1]).getTime()
    const curr = new Date(sortedDays[i]).getTime()
    const diff = Math.round((curr - prev) / 86400000)
    cur = diff === 1 ? cur + 1 : 1
    longestDays = Math.max(longestDays, cur)
  }
  longestDays = Math.max(longestDays, currentDays)

  // Current week streak
  let currentWeeks = 0
  let w = new Date(today)
  while (activeWeeks.has(getMondayStr(w))) {
    currentWeeks++
    w.setDate(w.getDate() - 7)
  }

  // Longest week streak
  const sortedWeeks = Array.from(activeWeeks).sort()
  let longestWeeks = 0, curW = 0
  for (let i = 0; i < sortedWeeks.length; i++) {
    if (i === 0) { curW = 1; longestWeeks = 1; continue }
    const prev = new Date(sortedWeeks[i - 1]).getTime()
    const curr = new Date(sortedWeeks[i]).getTime()
    const diff = Math.round((curr - prev) / 86400000 / 7)
    curW = diff === 1 ? curW + 1 : 1
    longestWeeks = Math.max(longestWeeks, curW)
  }
  longestWeeks = Math.max(longestWeeks, currentWeeks)

  return {
    currentDays, longestDays, currentWeeks, longestWeeks,
    totalActiveDays: activeDays.size, totalActiveWeeks: activeWeeks.size,
  }
}

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export const COMPARISON_COLORS = ['#378d44', '#c05a17', '#2563eb', '#9333ea']
