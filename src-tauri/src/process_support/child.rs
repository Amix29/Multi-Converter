use super::terminate_child_process;
use std::ops::{Deref, DerefMut};
use std::process::Child;

pub(crate) struct ManagedChild(Child);

impl ManagedChild {
    pub(crate) fn new(child: Child) -> Self {
        Self(child)
    }
}

impl Deref for ManagedChild {
    type Target = Child;
    fn deref(&self) -> &Child {
        &self.0
    }
}

impl DerefMut for ManagedChild {
    fn deref_mut(&mut self) -> &mut Child {
        &mut self.0
    }
}

impl Drop for ManagedChild {
    fn drop(&mut self) {
        if !matches!(self.0.try_wait(), Ok(Some(_))) {
            terminate_child_process(&mut self.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};

    #[test]
    fn dropping_an_unfinished_engine_stops_its_process() {
        let mut command = if cfg!(windows) {
            let mut command = Command::new("powershell");
            command.args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Sleep -Seconds 30",
            ]);
            command
        } else {
            let mut command = Command::new("sh");
            command.args(["-c", "sleep 30"]);
            command
        };
        super::super::configure_child_process(&mut command);
        let mut child = ManagedChild::new(
            command
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap(),
        );
        assert!(child.try_wait().unwrap().is_none());
        let id = child.id();
        drop(child);
        #[cfg(windows)]
        {
            let output = Command::new("tasklist")
                .args(["/FI", &format!("PID eq {id}"), "/FO", "CSV", "/NH"])
                .output()
                .unwrap();
            assert!(!String::from_utf8_lossy(&output.stdout).contains(&format!(",\"{id}\",")));
        }
        #[cfg(unix)]
        assert_ne!(unsafe { super::super::kill(id as i32, 0) }, 0);
    }
}
