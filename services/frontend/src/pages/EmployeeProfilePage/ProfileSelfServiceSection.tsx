import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { EmployeeProfileResponse } from '@/api/profile'
import {
  createEmergencyContactApiCall,
  deleteEmergencyContactApiCall,
  deleteProfileCertificateApiCall,
  uploadProfileCertificateApiCall,
  uploadProfilePhotoApiCall,
} from '@/api/profile'

interface ProfileSelfServiceSectionProps {
  personId: string
  profile: EmployeeProfileResponse
}

export const ProfileSelfServiceSection = ({
  personId,
  profile,
}: ProfileSelfServiceSectionProps) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const certificateInputRef = useRef<HTMLInputElement>(null)

  const refreshProfile = async () => {
    await queryClient.invalidateQueries({ queryKey: ['employee-profile', personId] })
  }

  const handleAddContact = async () => {
    const contactName = window.prompt(t('employeeProfile.emergencyContacts.promptName'))
    if (!contactName?.trim()) {
      return
    }
    await createEmergencyContactApiCall(personId, { contactName: contactName.trim() })
    await refreshProfile()
  }

  const handleDeleteContact = async (contactId: string) => {
    await deleteEmergencyContactApiCall(personId, contactId)
    await refreshProfile()
  }

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    await uploadProfilePhotoApiCall(personId, file)
    await refreshProfile()
    event.target.value = ''
  }

  const handleCertificateSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    await uploadProfileCertificateApiCall(personId, file)
    await refreshProfile()
    event.target.value = ''
  }

  const handleDeleteCertificate = async (certificateId: string) => {
    await deleteProfileCertificateApiCall(personId, certificateId)
    await refreshProfile()
  }

  return (
    <>
      {profile.s1 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-medium text-foreground">
            {t('employeeProfile.sections.photo')}
          </h2>
          {profile.s1.photoUrl ? (
            <img
              src={profile.s1.photoUrl}
              alt={profile.s1.fullName}
              className="mb-3 h-24 w-24 rounded-full object-cover"
            />
          ) : (
            <p className="mb-3 text-sm text-muted-foreground">
              {t('employeeProfile.photo.empty')}
            </p>
          )}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={event => {
              void handlePhotoSelected(event)
            }}
          />
          <button
            type="button"
            className="rounded-md border border-input px-3 py-1 text-sm"
            onClick={() => photoInputRef.current?.click()}
          >
            {t('employeeProfile.photo.upload')}
          </button>
        </section>
      )}

      {profile.s3 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-medium text-foreground">
            {t('employeeProfile.sections.emergencyContacts')}
          </h2>
          {profile.s3.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('employeeProfile.empty')}</p>
          ) : (
            <ul className="space-y-2 text-sm text-foreground">
              {profile.s3.map(contact => (
                <li
                  key={contact.id}
                  className="flex items-center justify-between gap-2 rounded border border-border p-2"
                >
                  <div>
                    <div>{contact.contactName}</div>
                    <div className="text-muted-foreground">
                      {[contact.relationship, contact.phone].filter(Boolean).join(' · ') ||
                        '—'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-sm text-destructive"
                    onClick={() => {
                      void handleDeleteContact(contact.id)
                    }}
                  >
                    {t('employeeProfile.emergencyContacts.delete')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="mt-3 rounded-md border border-input px-3 py-1 text-sm"
            onClick={() => {
              void handleAddContact()
            }}
          >
            {t('employeeProfile.emergencyContacts.add')}
          </button>
        </section>
      )}

      {profile.s5 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-medium text-foreground">
            {t('employeeProfile.sections.certificates')}
          </h2>
          {profile.s5.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('employeeProfile.empty')}</p>
          ) : (
            <ul className="space-y-2 text-sm text-foreground">
              {profile.s5.map(certificate => (
                <li
                  key={certificate.id}
                  className="flex items-center justify-between gap-2 rounded border border-border p-2"
                >
                  <a
                    href={certificate.downloadUrl}
                    className="text-primary underline"
                    download
                  >
                    {certificate.fileName}
                  </a>
                  <button
                    type="button"
                    className="text-sm text-destructive"
                    onClick={() => {
                      void handleDeleteCertificate(certificate.id)
                    }}
                  >
                    {t('employeeProfile.certificates.delete')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={certificateInputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className="hidden"
            onChange={event => {
              void handleCertificateSelected(event)
            }}
          />
          <button
            type="button"
            className="mt-3 rounded-md border border-input px-3 py-1 text-sm"
            onClick={() => certificateInputRef.current?.click()}
          >
            {t('employeeProfile.certificates.upload')}
          </button>
        </section>
      )}
    </>
  )
}
