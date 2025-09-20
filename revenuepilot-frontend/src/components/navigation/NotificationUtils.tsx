export type NotificationVisualSeverity = 'info' | 'warning' | 'success' | 'error'

export interface Notification {
  id: string
  title: string
  message: string
  severity: string
  timestamp: string
  isRead: boolean
  readAt?: string | null
}

export const mockNotifications: Notification[] = [
  {
    id: '1',
    title: 'Patient Chart Upload Required',
    message: 'Michael Rodriguez (PT-2024-0143) chart needs to be uploaded before visit.',
    severity: 'warning',
    timestamp: '2024-03-14T08:30:00Z',
    isRead: false
  },
  {
    id: '2',
    title: 'Coding Accuracy Alert',
    message: 'Review suggested ICD-10 code J06.9 for improved reimbursement.',
    severity: 'info',
    timestamp: '2024-03-14T07:45:00Z',
    isRead: false
  },
  {
    id: '3',
    title: 'Draft Auto-Saved',
    message: 'Your note for Sarah Chen has been automatically saved.',
    severity: 'success',
    timestamp: '2024-03-14T07:15:00Z',
    isRead: true
  },
  {
    id: '4',
    title: 'System Maintenance',
    message: 'Scheduled maintenance window tonight 11 PM - 2 AM EST.',
    severity: 'info',
    timestamp: '2024-03-14T06:00:00Z',
    isRead: true
  },
  {
    id: '5',
    title: 'Quality Score Update',
    message: 'Your documentation quality score increased to 94%.',
    severity: 'success',
    timestamp: '2024-03-13T18:30:00Z',
    isRead: true
  }
]

export function getVisualSeverity(severity: string | null | undefined): NotificationVisualSeverity {
  const normalised = typeof severity === 'string' ? severity.toLowerCase() : 'info'
  if (normalised === 'error' || normalised === 'critical') {
    return 'error'
  }
  if (normalised === 'warning' || normalised === 'high') {
    return 'warning'
  }
  if (normalised === 'success') {
    return 'success'
  }
  return 'info'
}

export const formatTime = (timestamp: string) => {
  const date = new Date(timestamp)
  const now = new Date()
  const diffInHours = Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60)
  
  if (diffInHours < 1) {
    return `${Math.floor(diffInHours * 60)}m ago`
  } else if (diffInHours < 24) {
    return `${Math.floor(diffInHours)}h ago`
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

export const getNotificationBorderColor = (severity: string | null | undefined) => {
  const visual = getVisualSeverity(severity)
  switch (visual) {
    case 'warning':
      return 'border-l-orange-400'
    case 'error':
      return 'border-l-red-400'
    case 'success':
      return 'border-l-green-400'
    default:
      return 'border-l-blue-400'
  }
}

export const getNotificationColorClasses = (severity: string | null | undefined) => {
  const visual = getVisualSeverity(severity)
  switch (visual) {
    case 'warning':
      return 'text-orange-600 bg-orange-50 border-orange-200'
    case 'error':
      return 'text-red-600 bg-red-50 border-red-200'
    case 'success':
      return 'text-green-600 bg-green-50 border-green-200'
    default:
      return 'text-blue-600 bg-blue-50 border-blue-200'
  }
}