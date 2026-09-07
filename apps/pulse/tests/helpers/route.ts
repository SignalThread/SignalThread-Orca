import { NextRequest } from 'next/server'

type JsonRequestOptions = {
  method?: string
  url?: string
  body?: unknown
  headers?: Record<string, string>
}

export function jsonRequest({
  method = 'POST',
  url = 'http://localhost/api/test',
  body,
  headers = {},
}: JsonRequestOptions = {}): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function getRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: 'GET',
    headers,
  })
}

export function formDataRequest(url: string, formData: FormData, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: formData,
  })
}

export async function readJson<T = unknown>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

export function makeRouteParams<T extends Record<string, string>>(params: T): { params: T } {
  return { params }
}
