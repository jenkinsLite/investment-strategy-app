import React, { useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from '@aws-amplify/auth';
import { Sha256 } from '@aws-crypto/sha256-browser';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { HttpRequest } from '@aws-sdk/protocol-http';

// ==================== UPDATE THESE FOUR VALUES ====================
const YOUR_AGENT_RUNTIME_ARN = import.meta.env.VITE_AGENT_RUNTIME_ARN;
const AWS_REGION = import.meta.env.VITE_AWS_REGION;
// ===========================================================

function App() {
  const { user, signOut } = useAuthenticator((context) => [context.user, context.signOut]);
  const [lifeStage, setLifeStage] = useState('young');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const lifeStagePromptMap = {
    young: 'young worker (20s-30s)',
    older: 'older worker (40s-60s, nearing retirement)',
    retirement: 'retiree (60s+)'
  };

  const handleGetStrategies = async () => {
    setLoading(true);
    setResponse('Connecting to your AI advisor...');

    try {
      console.log('Starting agent invocation...');

      const session = await fetchAuthSession({ forceRefresh: true });
      const credentials = session.credentials;

      if (!credentials || !credentials.accessKeyId) {
        throw new Error('No AWS credentials received from Cognito.');
      }

      console.log('Credentials received:', {
        accessKeyId: credentials.accessKeyId,
        expiration: credentials.expiration?.toISOString()
      });

      const payload = {
        prompt: `Provide clear, practical investment strategies for a ${lifeStagePromptMap[lifeStage]}. 
Include key actions, recommended account types, asset allocation ideas, and end with a disclaimer that this is general educational information only.`
      };

      const body = JSON.stringify(payload);

      const hostname = `bedrock-agentcore.${AWS_REGION}.amazonaws.com`;
      const encodedArn = encodeURIComponent(YOUR_AGENT_RUNTIME_ARN);
      const path = `/runtimes/${encodedArn}/invocations`;

      const request = new HttpRequest({
        method: 'POST',
        hostname,
        path,
        protocol: 'https:',
        headers: {
          'Content-Type': 'application/json',
          'Host': hostname,
        },
        body,
      });

      console.log('Request prepared:', { path, method: request.method });

      const signer = new SignatureV4({
        credentials,
        service: 'bedrock-agentcore',
        region: AWS_REGION,
        sha256: Sha256,
      });

      const signedRequest = await signer.sign(request);
      console.log('Signed request prepared. Headers:', signedRequest.headers);

      const fetchResponse = await fetch(`https://${hostname}${path}`, {
        method: 'POST',
        headers: signedRequest.headers,
        body: signedRequest.body,
      });

      console.log('Fetch sent. Status:', fetchResponse.status);
      console.log('Response headers:', [...fetchResponse.headers.entries()]);

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text();
        throw new Error(`HTTP ${fetchResponse.status}: ${errorText}`);
      }

      const reader = fetchResponse.body?.getReader();
      if (!reader) throw new Error('No response body');

      let fullText = '';
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value);
      }

      console.log('Full response text received:', fullText.substring(0, 200) + '...');

      try {
        const parsed = JSON.parse(fullText.trim());
        setResponse(parsed.content || fullText.trim() || 'No content received.');
      } catch {
        setResponse(fullText.trim() || 'Received empty response.');
      }
    } catch (error) {
      console.error('Invocation failed:', error);
      setResponse(`Error: ${error.message || 'Failed to reach agent.'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ textAlign: 'center', color: '#1a0dab' }}>Investment Strategy Advisor</h1>
      <p style={{ textAlign: 'center', color: '#555' }}>Powered by Magic?</p>

      <p>Welcome, {user?.username || 'User'}! <button onClick={signOut}>Sign Out</button></p>

      <div style={{ textAlign: 'center', marginBottom: '30px' }}>
        <label style={{ fontSize: '18px', marginRight: '12px' }}>Your Life Stage:</label>
        <select
          value={lifeStage}
          onChange={(e) => setLifeStage(e.target.value)}
          style={{ fontSize: '18px', padding: '10px', borderRadius: '5px' }}
        >
          <option value="young">Young Worker (20s–30s)</option>
          <option value="older">Older Worker (40s–60s)</option>
          <option value="retirement">Retirement (60s+)</option>
        </select>

        <button
          onClick={handleGetStrategies}
          disabled={loading}
          style={{
            marginLeft: '20px',
            padding: '12px 24px',
            fontSize: '18px',
            backgroundColor: loading ? '#ccc' : '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Thinking...' : 'Get Strategies'}
        </button>
      </div>

      {response && (
        <div
          style={{
            backgroundColor: '#f8f9fa',
            padding: '25px',
            borderRadius: '10px',
            border: '1px solid #ddd',
            whiteSpace: 'pre-wrap',
            lineHeight: '1.6'
          }}
        >
          <h2 style={{ marginTop: '0' }}>Recommended Strategies:</h2>
          <p style={{ fontSize: '16px' }}>{response}</p>
        </div>
      )}

      <p style={{ textAlign: 'center', marginTop: '50px', color: '#666', fontSize: '14px' }}>
        <em>Disclaimer: General educational information only. Consult a professional advisor.</em>
      </p>
    </div>
  );
}

export default App;
