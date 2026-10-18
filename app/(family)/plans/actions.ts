'use server'

import { revalidatePath } from 'next/cache'
import { callTool } from '@/lib/jirani'

/** Cancel a plan that was saved wrongly or is off. Runs on the server, so the API token stays there. */
export async function cancelPlan(formData: FormData): Promise<void> {
  const id = formData.get('id')
  if (typeof id !== 'string' || !/^ctx-[\w-]+$/.test(id)) return
  await callTool('cancel_plan', { id })
  revalidatePath('/plans')
  revalidatePath('/')
}
