// A scripted stand-in for the Claude Messages API, for the Agent Inbox tests.
// The backend's real agent loop, rules and database run against it (via
// AGENT_MODEL_URL), so the actions in the inbox are real. Only the model's
// choices are scripted: it confirms the first pending dispatch, proposes
// cancelling the second, and raises one alert.
import http from 'node:http';

const port = Number(process.env.FAKE_MODEL_PORT || 8799);

const reply = (stopReason, content) => ({
  stop_reason: stopReason,
  usage: { input_tokens: 500, output_tokens: 60 },
  content,
});
const call = (id, name, input) => ({ type: 'tool_use', id, name, input });

function respond(messages) {
  const last = messages[messages.length - 1];
  if (typeof last.content === 'string') {
    return reply('tool_use', [call('toolu_list', 'list_open_dispatches', {})]);
  }
  const listResult = last.content.find(b => b.tool_use_id === 'toolu_list');
  if (listResult) {
    const { dispatches } = JSON.parse(listResult.content);
    const pending = dispatches.filter(d => d.status === 'PENDING');
    const calls = [
      call('toolu_alert', 'raise_alert', {
        severity: 'MEDIUM',
        subject: 'Stock review',
        reason: 'Stock is running low at the north godown. Please plan a reorder.',
      }),
    ];
    if (pending[0]) {
      calls.push(call('toolu_confirm', 'confirm_dispatch', {
        dispatch_id: pending[0].id,
        reason: 'A vehicle is assigned and its documents are in order.',
      }));
    }
    if (pending[1]) {
      calls.push(call('toolu_cancel', 'cancel_dispatch', {
        dispatch_id: pending[1].id,
        reason: 'The customer asked to call this off.',
      }));
    }
    return reply('tool_use', calls);
  }
  return reply('end_turn', [{ type: 'text', text: 'Reviewed the open dispatches (scripted test model).' }]);
}

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (req.method !== 'POST') {
        res.writeHead(200).end('ok');
        return;
      }
      const reply = respond(JSON.parse(body).messages);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(reply));
    });
  })
  .listen(port, '127.0.0.1', () => console.log(`fake model on ${port}`));
