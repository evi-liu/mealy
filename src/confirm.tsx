import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'

type Options = {
  title: string
  body?: string
  /** Label for the confirming button, e.g. "Leave household". */
  confirm: string
  cancel?: string
}
type Ask = (options: Options) => Promise<boolean>

const ConfirmContext = createContext<Ask>(() => Promise.resolve(false))

/**
 * In-app confirmations. Native confirm() can be suppressed or silently
 * cancelled in embedded browsers and some installed web apps.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<
    (Options & { resolve: (ok: boolean) => void }) | null
  >(null)
  const ask = useCallback<Ask>(
    (options) => new Promise((resolve) => setRequest({ ...options, resolve })),
    [],
  )
  function finish(ok: boolean) {
    request?.resolve(ok)
    setRequest(null)
  }
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <AlertDialog.Root
        open={request !== null}
        onOpenChange={(open) => {
          if (!open) finish(false)
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="dialogBackdrop confirmBackdrop" />
          <AlertDialog.Popup className="dialogPopup confirmPopup">
            <AlertDialog.Title>{request?.title}</AlertDialog.Title>
            {request?.body && (
              <AlertDialog.Description>{request.body}</AlertDialog.Description>
            )}
            <div className="buttonRow">
              <AlertDialog.Close className="secondaryButton">
                {request?.cancel ?? 'Cancel'}
              </AlertDialog.Close>
              <button
                type="button"
                className="primaryButton"
                onClick={() => finish(true)}
              >
                {request?.confirm}
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext.Provider>
  )
}

export const useConfirm = () => useContext(ConfirmContext)
