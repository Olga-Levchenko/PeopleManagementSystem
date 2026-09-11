/**
 * Main router configuration
 */

import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout/AppLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute/ProtectedRoute'
import { HomePage } from '@/pages/HomePage/HomePage'
import { ErrorPage } from '@/pages/ErrorPage/ErrorPage'
import { LoginPage } from '@/pages/LoginPage/LoginPage'
import { OrganisationalRelationshipsPage } from '@/pages/OrganisationalRelationshipsPage/OrganisationalRelationshipsPage'
import { AdministrationPage } from '@/pages/AdministrationPage/AdministrationPage'
import { AllEmployeesPage } from '@/pages/AllEmployeesPage/AllEmployeesPage'
import { ColleagueProfilePage } from '@/pages/ColleagueProfilePage/ColleagueProfilePage'

const router = createBrowserRouter([
  // Standalone error page (rendered outside the main layout)
  {
    path: '/app-error',
    element: <ErrorPage />,
  },

  // Public sign-in page (no auth required)
  {
    path: '/login',
    element: <LoginPage />,
  },

  // All application routes are protected: ProtectedRoute resolves the session from AuthContext
  // and redirects to /login if no authenticated user is found.
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <HomePage />,
          },
          {
            path: 'all-employees',
            element: <AllEmployeesPage />,
          },
          {
            path: 'people/:personId',
            element: <ColleagueProfilePage />,
          },
          {
            path: 'organisational-relationships',
            element: <OrganisationalRelationshipsPage />,
          },
          {
            path: 'administration/functional-roles',
            element: <AdministrationPage />,
          },
        ],
      },
    ],
  },

  // Catch-all route
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])

export const Router = () => {
  return <RouterProvider router={router} />
}
