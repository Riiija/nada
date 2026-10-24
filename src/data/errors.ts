/** Erreurs métier : le message est destiné à l'utilisateur, en français. */
export class AppError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export class PermissionError extends AppError {
  constructor(message = "Vous n'avez pas le droit d'effectuer cette action.") {
    super('permission', message)
  }
}

export class AuthError extends AppError {
  constructor(message: string) {
    super('auth', message)
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super('validation', message)
  }
}

export function errorMessage(error: unknown, fallback = "Une erreur s'est produite. Réessayez.") {
  return error instanceof AppError ? error.message : fallback
}
