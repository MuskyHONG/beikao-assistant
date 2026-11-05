import { execFileSync } from 'node:child_process';
// Synthetic account exists only inside the ephemeral CI Compose project.
execFileSync('docker', ['compose','-p','beikao-ci','exec','-T','api','node','apps/api/dist/bootstrap.js'], {
  input: JSON.stringify({ email:'admin@e2e.test', displayName:'测试管理员', password:'E2E.Only.Password.123' }), stdio:['pipe','inherit','inherit'],
});
