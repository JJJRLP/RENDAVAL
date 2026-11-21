"""Run C3 counterexamples against an unmodified copy of upstream contract code."""
from pathlib import Path
import os, shutil, subprocess, tempfile
source = Path('/tmp/claude-1000/-home-oydual3-Vault-Landing-/01f64b02-a7c0-4c32-9ce0-5f11a1590690/scratchpad/tw/trustlesswork-smart-contract-stellar')
assert subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip() == 'ec4182547a0258d4f81694fa596ab90c11a06bd0'
target = Path(tempfile.mkdtemp(prefix='rendaval-c3-upstream-'))
shutil.copytree(source / 'contracts/escrow/src', target / 'src')
(target / 'Cargo.toml').write_text('[package]\nname = "rendaval-c3-upstream-probe"\nversion = "0.0.0"\nedition = "2021"\n[dependencies]\nsoroban-sdk = { version = "=29.0.1", features = ["testutils"] }\nsoroban-token-sdk = "=29.0.1"\n')
lib = target / 'src/lib.rs'
lib.write_text(lib.read_text().replace('mod tests;', 'mod c3_tests;'))
shutil.copyfile(Path(__file__).with_name('tw_state_tests.rs'), target / 'src/c3_tests.rs')
env = {**os.environ, 'CARGO_HOME': '/tmp/rendaval-cargo', 'CARGO_TARGET_DIR': str(Path.cwd() / 'contracts/target')}
raise SystemExit(subprocess.call(['cargo', 'test', '--manifest-path', str(target / 'Cargo.toml'), 'c3_', '--', '--nocapture'], env=env))
