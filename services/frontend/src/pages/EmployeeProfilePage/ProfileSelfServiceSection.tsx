import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { employeeProfileQueryKey } from '@/api/hooks/useEmployeeProfile'
import type { EmployeeProfileResponse } from '@/api/profile'
import {
  createEmergencyContactApiCall,
  deleteEmergencyContactApiCall,
  deleteProfileCertificateApiCall,
  uploadProfileCertificateApiCall,
  uploadProfilePhotoApiCall,
} from '@/api/profile'
import { Button } from '@/components/ui/button'
import { resolveBffUrl } from '@/lib/resolve-bff-url'
import { resolveUploadErrorMessage } from '@/lib/upload-error-message'
import { useAuthenticatedAssetUrl } from '@/pages/EmployeeProfilePage/hooks/useAuthenticatedAssetUrl'

interface ProfileSelfServiceSectionProps {
  personId: string
  profile: EmployeeProfileResponse
}

const SectionError = ({ message }: { message: string }) => (
  <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
    {message}
  </p>
)

export const ProfileSelfServiceSection = ({
  personId,
  profile,
}: ProfileSelfServiceSectionProps) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const photoInputRef = useRef<HTMLInputElement>(null)
  const certificateInputRef = useRef<HTMLInputElement>(null)

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [isUploadingCertificate, setIsUploadingCertificate] = useState(false)
  const [isMutatingContact, setIsMutatingContact] = useState(false)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null)
  const [photoRevision, setPhotoRevision] = useState(0)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [certificateError, setCertificateError] = useState<string | null>(null)
  const [contactError, setContactError] = useState<string | null>(null)

  const authenticatedPhotoUrl = useAuthenticatedAssetUrl(
    profile.s1?.photoUrl,
    photoRevision,
  )
  const displayedPhotoUrl = photoPreviewUrl ?? authenticatedPhotoUrl

  useEffect(() => {
    if (!photoPreviewUrl || photoRevision === 0 || !authenticatedPhotoUrl) {
      return
    }
    URL.revokeObjectURL(photoPreviewUrl)
    setPhotoPreviewUrl(null)
  }, [authenticatedPhotoUrl, photoPreviewUrl, photoRevision])

  const refreshProfile = async () => {
    await queryClient.invalidateQueries({
      queryKey: employeeProfileQueryKey(personId),
    })
    await queryClient.refetchQueries({
      queryKey: employeeProfileQueryKey(personId),
    })
  }

  const handleAddContact = async () => {
    const contactName = window.prompt(t('employeeProfile.emergencyContacts.promptName'))
    if (!contactName?.trim()) {
      return
    }
    setIsMutatingContact(true)
    setContactError(null)
    try {
      await createEmergencyContactApiCall(personId, { contactName: contactName.trim() })
      await refreshProfile()
    } catch {
      setContactError(t('employeeProfile.mutationError'))
    } finally {
      setIsMutatingContact(false)
    }
  }

  const handleDeleteContact = async (contactId: string) => {
    setIsMutatingContact(true)
    setContactError(null)
    try {
      await deleteEmergencyContactApiCall(personId, contactId)
      await refreshProfile()
    } catch {
      setContactError(t('employeeProfile.mutationError'))
    } finally {
      setIsMutatingContact(false)
    }
  }

  const handlePhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const preview = URL.createObjectURL(file)
    setPhotoPreviewUrl(preview)
    setIsUploadingPhoto(true)
    setPhotoError(null)

    try {
      await uploadProfilePhotoApiCall(personId, file)
      await refreshProfile()
      setPhotoRevision(current => current + 1)
    } catch (error: unknown) {
      URL.revokeObjectURL(preview)
      setPhotoPreviewUrl(null)
      setPhotoError(
        resolveUploadErrorMessage(
          error,
          t('employeeProfile.photo.uploadError'),
          t('employeeProfile.photo.tooLarge'),
        ),
      )
    } finally {
      setIsUploadingPhoto(false)
      event.target.value = ''
    }
  }

  const handleCertificateSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setIsUploadingCertificate(true)
    setCertificateError(null)

    try {
      await uploadProfileCertificateApiCall(personId, file)
      await refreshProfile()
    } catch (error: unknown) {
      setCertificateError(
        resolveUploadErrorMessage(
          error,
          t('employeeProfile.certificates.uploadError'),
          t('employeeProfile.certificates.tooLarge'),
        ),
      )
    } finally {
      setIsUploadingCertificate(false)
      event.target.value = ''
    }
  }

  const handleDeleteCertificate = async (certificateId: string) => {
    setIsUploadingCertificate(true)
    setCertificateError(null)
    try {
      await deleteProfileCertificateApiCall(personId, certificateId)
      await refreshProfile()
    } catch {
      setCertificateError(t('employeeProfile.mutationError'))
    } finally {
      setIsUploadingCertificate(false)
    }
  }

  const isBusy =
    isUploadingPhoto || isUploadingCertificate || isMutatingContact

  return (
    <>
      {profile.s1 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-medium text-foreground">
            {t('employeeProfile.sections.photo')}
          </h2>
          {photoError && <SectionError message={photoError} />}
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              {displayedPhotoUrl ? (
                <img
                  src={displayedPhotoUrl}
                  alt=""
                  className="h-24 w-24 rounded-full object-cover ring-1 ring-border"
                />
              ) : (
                <div
                  className="flex h-24 w-24 items-center justify-center rounded-full bg-muted px-2 text-center text-xs text-muted-foreground ring-1 ring-border"
                  aria-hidden="true"
                >
                  {t('employeeProfile.photo.empty')}
                </div>
              )}
              {isUploadingPhoto && (
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {t('employeeProfile.photo.hint')}
              </p>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                disabled={isBusy}
                onChange={event => {
                  void handlePhotoSelected(event)
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => photoInputRef.current?.click()}
              >
                {isUploadingPhoto && (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                )}
                {isUploadingPhoto
                  ? t('employeeProfile.photo.uploading')
                  : t('employeeProfile.photo.upload')}
              </Button>
            </div>
          </div>
        </section>
      )}

      {profile.s3 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-medium text-foreground">
            {t('employeeProfile.sections.emergencyContacts')}
          </h2>
          {contactError && <SectionError message={contactError} />}
          {profile.s3.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('employeeProfile.empty')}</p>
          ) : (
            <ul className="space-y-2">
              {profile.s3.map(contact => (
                <li
                  key={contact.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{contact.contactName}</p>
                    <p className="text-sm text-muted-foreground">
                      {[contact.relationship, contact.phone].filter(Boolean).join(' · ') ||
                        '—'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => {
                      void handleDeleteContact(contact.id)
                    }}
                  >
                    {t('employeeProfile.emergencyContacts.delete')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={isBusy}
            onClick={() => {
              void handleAddContact()
            }}
          >
            {isMutatingContact && (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            )}
            {t('employeeProfile.emergencyContacts.add')}
          </Button>
        </section>
      )}

      {profile.s5 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-medium text-foreground">
            {t('employeeProfile.sections.certificates')}
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {t('employeeProfile.certificates.hint')}
          </p>
          {certificateError && <SectionError message={certificateError} />}
          {profile.s5.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('employeeProfile.empty')}</p>
          ) : (
            <ul className="space-y-2">
              {profile.s5.map(certificate => (
                <li
                  key={certificate.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <a
                    href={resolveBffUrl(certificate.downloadUrl)}
                    className="min-w-0 flex-1 truncate text-sm text-primary underline"
                    title={certificate.fileName}
                    download={certificate.fileName}
                  >
                    {certificate.fileName}
                  </a>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="shrink-0"
                    disabled={isBusy}
                    onClick={() => {
                      void handleDeleteCertificate(certificate.id)
                    }}
                  >
                    {t('employeeProfile.certificates.delete')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={certificateInputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            disabled={isBusy}
            onChange={event => {
              void handleCertificateSelected(event)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={isBusy}
            onClick={() => certificateInputRef.current?.click()}
          >
            {isUploadingCertificate && (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            )}
            {isUploadingCertificate
              ? t('employeeProfile.certificates.uploading')
              : t('employeeProfile.certificates.upload')}
          </Button>
        </section>
      )}
    </>
  )
}
