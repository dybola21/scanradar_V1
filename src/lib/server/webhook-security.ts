import { assertDispatchEnabled } from "./dispatch-policy";
import { createHash } from 'crypto';
import dns from 'dns';
import { serverLogScanEvent } from '../logs.server';

import { promisify } from 'util';
import { isIP } from 'net';

const resolve4 = promisify(dns.resolve4);
const resolve6 = promisify(dns.resolve6);

/**
 * Checks if an IP address is private or reserved.
 */
function isPrivateIP(ip: string): boolean {
  // IPv4 Private & Reserved Ranges
  const ipv4Match = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match && ipv4Match.length === 5) {
    const b1 = parseInt(ipv4Match[1]!, 10);
    const b2 = parseInt(ipv4Match[2]!, 10);
    const b3 = parseInt(ipv4Match[3]!, 10);
    const b4 = parseInt(ipv4Match[4]!, 10);
    
    // 0.0.0.0/8 (Local network)
    if (b1 === 0) return true;
    // 10.0.0.0/8 (Private)
    if (b1 === 10) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (b1 === 100 && b2 >= 64 && b2 <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (b1 === 127) return true;
    // 169.254.0.0/16 (Link-local)
    if (b1 === 169 && b2 === 254) return true;
    // 172.16.0.0/12 (Private)
    if (b1 === 172 && b2 >= 16 && b2 <= 31) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (b1 === 192 && b2 === 0 && b3 === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (b1 === 192 && b2 === 0 && b3 === 2) return true;
    // 192.88.99.0/24 (6to4 Relay)
    if (b1 === 192 && b2 === 88 && b3 === 99) return true;
    // 192.168.0.0/16 (Private)
    if (b1 === 192 && b2 === 168) return true;
    // 198.18.0.0/15 (Network Benchmark)
    if (b1 === 198 && b2 >= 18 && b2 <= 19) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (b1 === 198 && b2 === 51 && b3 === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (b1 === 203 && b2 === 0 && b3 === 113) return true;
    // 224.0.0.0/4 (Multicast)
    if (b1 >= 224 && b1 <= 239) return true;
    // 240.0.0.0/4 (Reserved)
    if (b1 >= 240) return true;
  }

  // IPv6 Private & Reserved Ranges (Simplified check for common ones)
  if (ip.includes(':')) {
    const lowerIp = ip.toLowerCase();
    // Loopback ::1
    if (lowerIp === '::1') return true;
    // Unique Local Address fc00::/7
    if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd')) return true;
    // Link-local fe80::/10
    if (lowerIp.startsWith('fe8')) return true;
  }

  return false;
}

/**
 * Validates a URL for SSRF protection.
 * Resolves the hostname to IPs and checks if they are private.
 */
export async function validateWebhookUrl(url: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const parsed = new URL(url);
    
    
    if (parsed.protocol !== 'https:') {
      
      return { valid: false, error: 'Apenas URLs HTTPS são permitidas por segurança.' };
    }

    const hostname = parsed.hostname;

    // 1. Check if hostname is already a literal IP
    if (isIP(hostname)) {
      if (isPrivateIP(hostname)) {
        return { valid: false, error: 'Destino inválido: Redes privadas não são permitidas.' };
      }
      return { valid: true };
    }

    // 2. Resolve hostname to IPs
    try {
      
      const ipv4s = await resolve4(hostname).catch((err) => {
        
        return [];
      });
      const ipv6s = await resolve6(hostname).catch((err) => {
        
        return [];
      });
      const allIps = [...ipv4s, ...ipv6s];

      if (allIps.length === 0) {
        
        return { valid: false, error: 'Não foi possível resolver o endereço do servidor.' };
      }

      
      for (const ip of allIps) {
        if (isPrivateIP(ip)) {
          
          return { valid: false, error: 'O servidor resolve para um endereço de rede privada proibido.' };
        }
      }
    } catch (e: any) {
      
      return { valid: false, error: 'Erro ao validar o destino da requisição.' };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'URL de webhook inválida.' };
  }
}

/**
 * Safe fetch for webhooks that prevents redirects and limits response.
 */
export async function safeWebhookFetch(url: string, options: RequestInit = {}): Promise<Response> {
  assertDispatchEnabled();
  const validation = await validateWebhookUrl(url);
  if (!validation.valid) {
    const errorMsg = validation.error || 'URL inválida';
    await serverLogScanEvent({
      eventType: 'SYSTEM_ERROR' as any,
      eventStatus: 'failed',
      errorMessage: errorMsg,
      message: 'Destino do webhook recusado pela validação de segurança.'
    });
    throw new Error(errorMsg);
  }



  // TanStack Start / Node environment
  // We disable redirects and set a strict timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    
    controller.abort();
  }, 15000); // 15s timeout

  try {
    
    
    
    

    const response = await fetch(url, {
      ...options,
      redirect: 'manual', 
      signal: controller.signal,
    });

    
    
    
    // Strict redirect blocking for SSRF protection
    if (response.status >= 300 && response.status < 400) {
      
      throw new Error('Redirecionamentos não são permitidos por segurança.');
    }

    // Check content length to avoid decompression bombs or huge responses
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 1024 * 1024) { // 1MB limit
      throw new Error('A resposta do webhook excedeu o limite de tamanho permitido.');
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}
