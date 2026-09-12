import { useState } from 'react'
import { ArrowLeft, User } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useEmployeeProfile } from '@/api/hooks/useEmployeeProfile'
import { usePatchProfileField } from '@/api/hooks/usePatchProfileField'
import { ProfileInlineEditableField } from './ProfileInlineEditableField'
import { ProfileSelfServiceSection } from './ProfileSelfServiceSection'

const formatDate = (value: string | null | undefined): string => {
  if (!value) {
    return '—'
  }
  return value.slice(0, 10)
}

const formatBirthday = (
  month: number | null | undefined,
  day: number | null | undefined,
): string => {
  if (month == null || day == null) {
    return '—'
  }
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

type S2FieldKey = 'personalPhone' | 'personalEmail' | 'residentialAddress'

export const EmployeeProfilePage = () => {
  const { t } = useTranslation()
  const { personId } = useParams<{ personId: string }>()
  const profileQuery = useEmployeeProfile(personId)
  const patchMutation = usePatchProfileField(personId)
  const [liveMessage, setLiveMessage] = useState('')

  const isSelfProfile = profileQuery.data?.isSelf === true

  const saveS2Field = async (fieldKey: S2FieldKey, value: unknown) => {
    try {
      await patchMutation.mutateAsync({ fieldKey, value })
      setLiveMessage(t('employeeProfile.saveSuccess', { field: fieldKey }))
    } catch {
      setLiveMessage(t('employeeProfile.saveError', { field: fieldKey }))
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div aria-live="polite" className="sr-only">{liveMessage}</div>

      <div className="flex items-center gap-3">
        <Link
          to="/all-employees"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('employeeProfile.backToList')}
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {profileQuery.data?.s1?.fullName ?? t('employeeProfile.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('employeeProfile.description')}
          </p>
        </div>
      </div>

      {profileQuery.isLoading ? (
        <p className="text-muted-foreground">{t('employeeProfile.loading')}</p>
      ) : profileQuery.isError ? (
        <p className="text-destructive">{t('employeeProfile.error')}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {profileQuery.data?.s1 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-lg font-medium text-foreground">
                {t('employeeProfile.sections.identity')}
              </h2>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t('employeeProfile.fields.position')}</dt>
                  <dd className="text-foreground">{profileQuery.data.s1.position ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('employeeProfile.fields.department')}</dt>
                  <dd className="text-foreground">
                    {profileQuery.data.s1.department?.name ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('employeeProfile.fields.countryCity')}</dt>
                  <dd className="text-foreground">{profileQuery.data.s1.countryCity ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('employeeProfile.fields.workEmail')}</dt>
                  <dd className="text-foreground">{profileQuery.data.s1.workEmail ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('employeeProfile.fields.workPhone')}</dt>
                  <dd className="text-foreground">{profileQuery.data.s1.workPhone ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('employeeProfile.fields.birthday')}</dt>
                  <dd className="text-foreground">
                    {formatBirthday(
                      profileQuery.data.s1.birthdayMonth,
                      profileQuery.data.s1.birthdayDay,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('employeeProfile.fields.startDate')}</dt>
                  <dd className="text-foreground">
                    {formatDate(profileQuery.data.s1.startDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('employeeProfile.fields.manager')}</dt>
                  <dd className="text-foreground">
                    {profileQuery.data.s1.manager?.fullName ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('employeeProfile.fields.peoplePartner')}</dt>
                  <dd className="text-foreground">
                    {profileQuery.data.s1.peoplePartner?.fullName ?? '—'}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {profileQuery.data?.s4 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-lg font-medium text-foreground">
                {t('employeeProfile.sections.employment')}
              </h2>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">
                    {t('employeeProfile.fields.employmentType')}
                  </dt>
                  <dd className="text-foreground">
                    {profileQuery.data.s4.employmentType ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('employeeProfile.fields.grade')}</dt>
                  <dd className="text-foreground">{profileQuery.data.s4.grade ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t('employeeProfile.fields.seniority')}
                  </dt>
                  <dd className="text-foreground">
                    {profileQuery.data.s4.seniority ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t('employeeProfile.fields.englishLevel')}
                  </dt>
                  <dd className="text-foreground">
                    {profileQuery.data.s4.englishLevel ?? '—'}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {profileQuery.data?.s9 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-lg font-medium text-foreground">
                {t('employeeProfile.sections.careerTimeline')}
              </h2>
              {profileQuery.data.s9.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('employeeProfile.empty')}</p>
              ) : (
                <ul className="space-y-2 text-sm text-foreground">
                  {profileQuery.data.s9.map((event, index) => (
                    <li key={`${event.eventType}-${event.occurredAt}-${index}`}>
                      <span>{formatDate(event.occurredAt)}</span>
                      <span className="text-muted-foreground"> — {event.summary}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {isSelfProfile && profileQuery.data && personId && (
            <ProfileSelfServiceSection personId={personId} profile={profileQuery.data} />
          )}

          {profileQuery.data?.s2 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-lg font-medium text-foreground">
                {t('employeeProfile.sections.personalContacts')}
              </h2>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">
                    {t('employeeProfile.fields.personalPhone')}
                  </dt>
                  <dd className="text-foreground">
                    <ProfileInlineEditableField
                      value={profileQuery.data.s2.personalPhone}
                      editable={isSelfProfile}
                      saving={patchMutation.isPending}
                      onSave={value => saveS2Field('personalPhone', value)}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t('employeeProfile.fields.personalEmail')}
                  </dt>
                  <dd className="text-foreground">
                    <ProfileInlineEditableField
                      value={profileQuery.data.s2.personalEmail}
                      editable={isSelfProfile}
                      saving={patchMutation.isPending}
                      onSave={value => saveS2Field('personalEmail', value)}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t('employeeProfile.fields.residentialAddress')}
                  </dt>
                  <dd className="text-foreground">
                    <ProfileInlineEditableField
                      value={profileQuery.data.s2.residentialAddress}
                      editable={isSelfProfile}
                      saving={patchMutation.isPending}
                      onSave={value => saveS2Field('residentialAddress', value)}
                    />
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {profileQuery.data?.s10 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-lg font-medium text-foreground">
                {t('employeeProfile.sections.leaves')}
              </h2>
              {profileQuery.data.s10.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('employeeProfile.empty')}</p>
              ) : (
                <ul className="space-y-2 text-sm text-foreground">
                  {profileQuery.data.s10.map((leave, index) => (
                    <li key={`${leave.startDate}-${leave.endDate}-${index}`}>
                      {formatDate(leave.startDate)} – {formatDate(leave.endDate)}
                      {leave.leaveType ? ` (${leave.leaveType})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {profileQuery.data?.s11 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-lg font-medium text-foreground">
                {t('employeeProfile.sections.projects')}
              </h2>
              {profileQuery.data.s11.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('employeeProfile.empty')}</p>
              ) : (
                <ul className="space-y-2 text-sm text-foreground">
                  {profileQuery.data.s11.map((project, index) => (
                    <li key={`${project.projectName}-${index}`}>
                      <span>{project.projectName}</span>
                      {project.role && (
                        <span className="text-muted-foreground"> — {project.role}</span>
                      )}
                      {(project.startDate || project.endDate) && (
                        <span className="text-muted-foreground">
                          {' '}
                          ({formatDate(project.startDate)}
                          {project.endDate ? ` – ${formatDate(project.endDate)}` : ''})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {profileQuery.data?.s16 && profileQuery.data.s16.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-lg font-medium text-foreground">
                {t('employeeProfile.sections.customFields')}
              </h2>
              <dl className="grid gap-3 text-sm">
                {profileQuery.data.s16.map(field => (
                  <div key={field.fieldId}>
                    <dt className="text-muted-foreground">{field.name}</dt>
                    <dd className="text-foreground">
                      {field.value === null || field.value === undefined
                        ? '—'
                        : String(field.value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
