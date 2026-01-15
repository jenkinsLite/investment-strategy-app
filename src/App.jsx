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

      const session = await fetchAuthSession({ forceRefresh: true });
      const credentials = session.credentials;

      if (!credentials || !credentials.accessKeyId) {
        throw new Error('No AWS credentials received from Cognito.');
      }

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

      const signer = new SignatureV4({
        credentials,
        service: 'bedrock-agentcore',
        region: AWS_REGION,
        sha256: Sha256,
      });

      const signedRequest = await signer.sign(request);

      const fetchResponse = await fetch(`https://${hostname}${path}`, {
        method: 'POST',
        headers: signedRequest.headers,
        body: signedRequest.body,
      });

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text();
        throw new Error(`HTTP ${fetchResponse.status}: ${errorText}`);
      }

      const reader = fetchResponse.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();

let fullText = '';
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  let chunk = decoder.decode(value);

  // Clean the chunk immediately (remove "data:", quotes, etc.)
  chunk = chunk.replace(/data:\s*/gi, '').replace(/^["']+|["']+$/g, '').trim();

  buffer += chunk;

  // Check for sentence/paragraph end (period, question, exclamation + space/newline)
  if (buffer.match(/[\.\!\?]\s*$/) || buffer.includes('\n\n')) {
    fullText += buffer + ' '; // Add space for natural flow
    setResponse(fullText.trim()); // Update UI with complete sentence
    buffer = ''; // Reset buffer
  }
}

// Flush any remaining buffer at the end
if (buffer) {
  fullText += buffer;
  setResponse(fullText.trim());
}

      console.log("fullText.trim() response: ", fullText.trim());

      try {
        const parsed = JSON.parse(fullText.trim());
        console.log("parsed response: ", parsed);
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
  <div style={{
    backgroundColor: '#1e1e1e',           // Dark background like terminal
    color: '#d4d4d4',                     // Light gray text
    fontFamily: 'Consolas, "Courier New", monospace', // Classic terminal font
    fontSize: '15px',
    lineHeight: '1.45',
    padding: '20px',
    borderRadius: '8px',
    marginTop: '24px',
    border: '1px solid #444',
    overflowX: 'auto',                    // Horizontal scroll if very long lines
    whiteSpace: 'pre-wrap',               // Preserves spaces & wraps long lines
    wordBreak: 'break-word',              // Breaks very long words
    maxHeight: '600px',                   // Optional: limit height with scroll
    overflowY: 'auto',
  }}>
    <h3 style={{
      margin: '0 0 16px 0',
      color: '#9cdcfe',                   // Light blue header like CLI titles
      fontSize: '18px',
      fontWeight: 600
    }}>
      Recommended Strategies
    </h3>

    {/* The raw response — rendered as pre-formatted text */}
    <pre style={{
      margin: 0,
      padding: 0,
      background: 'transparent',
      border: 'none',
      color: 'inherit',
      fontFamily: 'inherit',
      fontSize: 'inherit',
      lineHeight: 'inherit',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word'
    }}>
      {response
        // Clean up common streaming artifacts
        .replace(/data:\s*/gi, '')           // Remove any "data:" prefixes
        .replace(/^["']+|["']+$/g, '')       // Strip stray quotes
        .trim()}
    </pre>
  </div>
)}

      <p style={{ textAlign: 'center', marginTop: '50px', color: '#666', fontSize: '14px' }}>
        <em>Disclaimer: General educational information only. Consult a professional advisor.</em>
      </p>
    </div>
  );
}

export default App;
