import { apiClient } from '@/api/client'

export interface PersonSummary {
  id: string
  fullName: string
}

export interface DepartmentSummary {
  id: string
  name: string | null
}

export interface S1IdentityCard {
  fullName: string
  photoUrl: string | null
  position: string | null
  department: DepartmentSummary | null
  countryCity: string | null
  workEmail: string | null
  workPhone: string | null
  birthdayMonth: number | null
  birthdayDay: number | null
  startDate: string | null
  manager: PersonSummary | null
  peoplePartner: PersonSummary | null
}

export interface S2PersonalContacts {
  personalPhone: string | null
  personalEmail: string | null
  residentialAddress: string | null
}

export interface S10Leave {
  startDate: string
  endDate: string
  leaveType?: string
}

export interface S11ProjectEntry {
  projectName: string
  role?: string
  startDate?: string
  endDate?: string
}

export interface S16CustomField {
  fieldId: string
  name: string
  value: string | number | boolean | null
}

export interface EmployeeProfileResponse {
  s1?: S1IdentityCard
  s2?: S2PersonalContacts
  s10?: S10Leave[]
  s11?: S11ProjectEntry[]
  s16?: S16CustomField[]
}

/** @deprecated Use EmployeeProfileResponse */
export type ColleagueProfileResponse = EmployeeProfileResponse

export interface PatchProfileFieldRequest {
  fieldKey: string
  value: unknown
}

export interface PatchProfileFieldResponse {
  fieldKey: string
  value: string | null
}

export const getEmployeeProfileApiCall = (
  personId: string,
  signal?: AbortSignal,
) =>
  apiClient.get<EmployeeProfileResponse>(`/api/v1/people/${personId}/profile`, {
    signal,
  })

export const patchProfileFieldApiCall = (
  personId: string,
  body: PatchProfileFieldRequest,
) =>
  apiClient.patch<PatchProfileFieldResponse>(
    `/api/v1/people/${personId}/profile/fields`,
    body,
  )

/** @deprecated Use getEmployeeProfileApiCall */
export const getColleagueProfileApiCall = getEmployeeProfileApiCall
