import { useTranslation } from 'react-i18next'
import type { EmployeeProfileResponse } from '@/api/profile'
import { resolveBffUrl } from '@/lib/resolve-bff-url'

interface ProfileManagementReadOnlySectionProps {
  profile: EmployeeProfileResponse
}

export const ProfileManagementReadOnlySection = ({
  profile,
}: ProfileManagementReadOnlySectionProps) => {
  const { t } = useTranslation()

  return (
    <>
      {profile.s3 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 text-lg font-medium text-foreground">
            {t('employeeProfile.sections.emergencyContacts')}
          </h2>
          {profile.s3.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('employeeProfile.empty')}</p>
          ) : (
            <ul className="space-y-2">
              {profile.s3.map(contact => (
                <li
                  key={contact.id}
                  className="rounded-md border border-border p-3"
                >
                  <p className="font-medium text-foreground">{contact.contactName}</p>
                  <p className="text-sm text-muted-foreground">
                    {[contact.relationship, contact.phone].filter(Boolean).join(' · ') ||
                      '—'}
                  </p>
                </li>
              ))}
            </ul>
          )}
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
            <ul className="space-y-2">
              {profile.s5.map(certificate => (
                <li
                  key={certificate.id}
                  className="rounded-md border border-border p-3"
                >
                  <a
                    href={resolveBffUrl(certificate.downloadUrl)}
                    className="text-sm text-primary underline"
                    title={certificate.fileName}
                    download={certificate.fileName}
                  >
                    {certificate.fileName}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}
