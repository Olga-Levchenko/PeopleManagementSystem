import { ArrowLeft, User } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useColleagueProfile } from '@/api/hooks/useColleagueProfile'

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

export const ColleagueProfilePage = () => {
  const { t } = useTranslation()
  const { personId } = useParams<{ personId: string }>()
  const profileQuery = useColleagueProfile(personId)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Link
          to="/all-employees"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('colleagueProfile.backToList')}
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <User className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            {profileQuery.data?.s1?.fullName ?? t('colleagueProfile.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('colleagueProfile.description')}
          </p>
        </div>
      </div>

      {profileQuery.isLoading ? (
        <p className="text-muted-foreground">{t('colleagueProfile.loading')}</p>
      ) : profileQuery.isError ? (
        <p className="text-destructive">{t('colleagueProfile.error')}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {profileQuery.data?.s1 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-lg font-medium text-foreground">
                {t('colleagueProfile.sections.identity')}
              </h2>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t('colleagueProfile.fields.position')}</dt>
                  <dd className="text-foreground">{profileQuery.data.s1.position ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('colleagueProfile.fields.department')}</dt>
                  <dd className="text-foreground">
                    {profileQuery.data.s1.department?.name ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('colleagueProfile.fields.countryCity')}</dt>
                  <dd className="text-foreground">{profileQuery.data.s1.countryCity ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('colleagueProfile.fields.workEmail')}</dt>
                  <dd className="text-foreground">{profileQuery.data.s1.workEmail ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('colleagueProfile.fields.workPhone')}</dt>
                  <dd className="text-foreground">{profileQuery.data.s1.workPhone ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('colleagueProfile.fields.birthday')}</dt>
                  <dd className="text-foreground">
                    {formatBirthday(
                      profileQuery.data.s1.birthdayMonth,
                      profileQuery.data.s1.birthdayDay,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('colleagueProfile.fields.startDate')}</dt>
                  <dd className="text-foreground">
                    {formatDate(profileQuery.data.s1.startDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('colleagueProfile.fields.manager')}</dt>
                  <dd className="text-foreground">
                    {profileQuery.data.s1.manager?.fullName ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('colleagueProfile.fields.peoplePartner')}</dt>
                  <dd className="text-foreground">
                    {profileQuery.data.s1.peoplePartner?.fullName ?? '—'}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {profileQuery.data?.s10 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-lg font-medium text-foreground">
                {t('colleagueProfile.sections.leaves')}
              </h2>
              {profileQuery.data.s10.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('colleagueProfile.empty')}</p>
              ) : (
                <ul className="space-y-2 text-sm text-foreground">
                  {profileQuery.data.s10.map((leave, index) => (
                    <li key={`${leave.startDate}-${leave.endDate}-${index}`}>
                      {formatDate(leave.startDate)} – {formatDate(leave.endDate)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {profileQuery.data?.s11 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-lg font-medium text-foreground">
                {t('colleagueProfile.sections.projects')}
              </h2>
              {profileQuery.data.s11.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('colleagueProfile.empty')}</p>
              ) : (
                <ul className="space-y-2 text-sm text-foreground">
                  {profileQuery.data.s11.map((project, index) => (
                    <li key={`${project.projectName}-${index}`}>{project.projectName}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {profileQuery.data?.s16 && profileQuery.data.s16.length > 0 && (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 text-lg font-medium text-foreground">
                {t('colleagueProfile.sections.customFields')}
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
