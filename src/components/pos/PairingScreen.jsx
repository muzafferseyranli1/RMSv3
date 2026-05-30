import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, ChevronRight } from 'lucide-react';
import { db } from '../../lib/db';

const CACHE_KEY = 'suitable_terminal_config_v1';

export default function PairingScreen({ onComplete }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pairKey, setPairKey] = useState('');

  // Input ref for auto-focus
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleVerifyCode = async () => {
    if (pairKey.length < 4) {
      setError('Geçerli bir Pair Key giriniz.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const searchCode = pairKey.startsWith('SUT-') ? pairKey : `SUT-${pairKey}`;

      // Production db query
      const { data, error: dbError } = await db.from('pos_terminals')
        .select('id,branch_id,device_type,is_master,terminal_role,screen_mode,terminal_name,config_data')
        .eq('activation_code', searchCode)
        .limit(1);

      if (dbError) throw dbError;
      const res = data || [];
      
      // If no result, fallback for dev/testing
      if (res.length === 0 && pairKey === 'DEV-123') {
          await finalizePairing({
             id: 'test-terminal-id',
             branch_id: 'test-branch-id',
             device_type: 'pos',
             is_master: true,
             config_data: {}
          });
      } else if (res.length > 0) {
          await db.from('pos_terminals').eq('id', res[0].id).update({ is_used: true });
          await finalizePairing(res[0]);
      } else {
          setError('Geçersiz Pair Key. Lütfen tekrar deneyin.');
      }
    } catch (err) {
       console.error("Pairing Error:", err);
       if (pairKey === 'DEV-123') {
          await finalizePairing({
             id: 'test-terminal-id',
             branch_id: 'test-branch-id',
             device_type: 'pos',
             is_master: true,
             config_data: {}
          });
       } else {
          setError(`Bağlantı veya Sorgu Hatası: ${err?.message || err}`);
       }
    } finally {
      setLoading(false);
    }
  };

  const finalizePairing = async (terminal) => {
    // Check if it's a slave and needs master IP
    let masterIp = '127.0.0.1';
    
    // In a full implementation, if is_master is false, we should fetch the master's IP
    // For now, we assume local network discovery or fallback to localhost if testing
    if (!terminal.is_master) {
      masterIp = '';
    }
    
    // Map device_type to screenMode
    // pos -> pos, masa -> garson (or pos-masalar based on usage), kds -> kds, pickup -> pickup
    let rawMode = String(terminal.screen_mode || terminal.device_type || 'pos').toLowerCase().trim();
    let screenMode = 'pos';
    if (rawMode.includes('masa') || rawMode.includes('garson')) {
      screenMode = 'garson';
    } else if (rawMode.includes('kds')) {
      screenMode = 'kds';
    } else if (rawMode.includes('pickup')) {
      screenMode = 'pickup';
    }

    const payload = {
       terminalId: terminal.id,
       branchId: terminal.branch_id,
       terminalRole: terminal.terminal_role || (terminal.is_master ? 'master' : 'slave'),
       masterIp: masterIp,
       screenMode: screenMode,
       configData: terminal.config_data || {},
       pairedAt: new Date().toISOString()
    };
    
    // Save to localStorage (cache)
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));

    if (window.electronAPI?.saveTerminalConfig) {
      await window.electronAPI.saveTerminalConfig(payload);
    }
    
    // Dispatch custom event for Electron main process to catch (via preload)
    window.dispatchEvent(new CustomEvent('terminal:pairing-complete', { detail: payload }));
    
    if (onComplete) {
       onComplete(payload);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-main)',
      color: 'var(--text-main)',
      fontFamily: "var(--font-family, 'Inter', sans-serif)"
    }}>
      <div style={{
        width: '100%',
        maxWidth: '500px',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '40px',
        boxShadow: 'var(--shadow-lg, 0 25px 50px -12px rgba(0, 0, 0, 0.5))'
      }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            background: 'rgba(99, 102, 241, 0.1)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            color: 'var(--brand-color, #6366f1)',
            boxShadow: '0 0 20px rgba(99, 102, 241, 0.2)'
          }}>
             <ShieldCheck size={32} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 8px 0' }}>Cihaz Eşleştirme</h1>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '14px' }}>
            Sisteme bağlanmak için cihaz eşleştirme anahtarını (Pair Key) giriniz.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#f87171',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '24px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>
              Pair Key
            </label>
            <input
              ref={inputRef}
              type="text"
              value={pairKey}
              onChange={(e) => setPairKey(e.target.value.toUpperCase().trim())}
              placeholder="Örn: 5XY9A2"
              style={{
                width: '100%',
                padding: '16px',
                fontSize: '24px',
                textAlign: 'center',
                letterSpacing: '4px',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-main)',
                outline: 'none',
                transition: 'border-color 0.2s',
                fontWeight: 'bold',
                textTransform: 'uppercase'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--brand-color, #6366f1)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
            />
          </div>
          <button
            onClick={handleVerifyCode}
            disabled={loading || pairKey.length < 4}
            style={{
              background: loading || pairKey.length < 4 ? 'var(--border-color)' : 'var(--brand-color, #6366f1)',
              color: loading || pairKey.length < 4 ? 'var(--text-muted)' : '#fff',
              border: 'none',
              padding: '16px',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading || pairKey.length < 4 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background 0.2s'
            }}
          >
            {loading ? 'Doğrulanıyor...' : 'Doğrula ve İlerle'}
            {!loading && <ChevronRight size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
}
