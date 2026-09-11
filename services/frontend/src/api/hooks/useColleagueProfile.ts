import { useQuery } from '@tanstack/react-query'
import { getColleagueProfileApiCall } from '@/api/profile'

export const useColleagueProfile = (personId: string | undefined) =>
  useQuery({
    queryKey: ['people', 'profile', personId],
    queryFn: ({ signal }) => {
      if (!personId) {
        throw new Error('personId is required')
      }
      return getColleagueProfileApiCall(personId, signal)
    },
    enabled: Boolean(personId),
  })
