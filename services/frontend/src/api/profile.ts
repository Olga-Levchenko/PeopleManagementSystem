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

export interface S3EmergencyContact {
  id: string
  contactName: string
  relationship: string | null
  phone: string | null
}

export interface S5Certificate {
  id: string
  fileName: string
  uploadedAt: string
  downloadUrl: string
}

export interface S4Employment {
  employmentType: string | null
  grade: string | null
  seniority: string | null
  englishLevel: string | null
}

export interface S9TimelineEntry {
  occurredAt: string
  eventType: string
  summary: string
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
  isSelf: boolean
  s1?: S1IdentityCard
  s2?: S2PersonalContacts
  s3?: S3EmergencyContact[]
  s4?: S4Employment
  s5?: S5Certificate[]
  s9?: S9TimelineEntry[]
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

export interface CreateEmergencyContactRequest {
  contactName: string
  relationship?: string | null
  phone?: string | null
}

export const createEmergencyContactApiCall = (
  personId: string,
  body: CreateEmergencyContactRequest,
) =>
  apiClient.post<S3EmergencyContact>(
    `/api/v1/people/${personId}/profile/emergency-contacts`,
    body,
  )

export const deleteEmergencyContactApiCall = (
  personId: string,
  contactId: string,
) =>
  apiClient.delete<void>(
    `/api/v1/people/${personId}/profile/emergency-contacts/${contactId}`,
  )

export const uploadProfilePhotoApiCall = (personId: string, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return apiClient.post<{ photoUrl: string }>(
    `/api/v1/people/${personId}/profile/photo`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
}

export const uploadProfileCertificateApiCall = (personId: string, file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return apiClient.post<S5Certificate>(
    `/api/v1/people/${personId}/profile/certificates`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
}

export const deleteProfileCertificateApiCall = (
  personId: string,
  certificateId: string,
) =>
  apiClient.delete<void>(
    `/api/v1/people/${personId}/profile/certificates/${certificateId}`,
  )

/** @deprecated Use getEmployeeProfileApiCall */
export const getColleagueProfileApiCall = getEmployeeProfileApiCall
