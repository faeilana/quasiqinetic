"""Placeholder for webcam-based motion tracking.

Not wired into any screen yet (the 3 level screens are static
placeholders for now). This stub exists so the next step - reading
jump/lean from the webcam and feeding it into a player controller - has
an obvious home and a clear interface to build against.

Suggested implementation (uncomment the relevant lines in
requirements.txt first: opencv-python, mediapipe):

    import cv2
    import mediapipe as mp

    class PoseTracker:
        def __init__(self, camera_index=0):
            self.cap = cv2.VideoCapture(camera_index)
            self.pose = mp.solutions.pose.Pose()
            self.shoulder_baseline_y = None
            self.hip_baseline_x = None

        def read(self):
            ok, frame = self.cap.read()
            if not ok:
                return None
            results = self.pose.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            return results.pose_landmarks

        def get_jump(self, landmarks) -> bool:
            # Compare current shoulder/hip Y to a resting baseline;
            # a jump is a quick upward spike past some threshold.
            ...

        def get_lean(self, landmarks) -> str:
            # Compare hip/shoulder X midpoint to a resting baseline;
            # return "left", "right", or "center".
            ...

This file currently ships only a no-op stub so the shell runs without
opencv/mediapipe installed.
"""


class PoseTracker:
    """No-op stand-in. Swap in the real implementation described above."""

    def __init__(self, camera_index: int = 0):
        self.camera_index = camera_index
        self.enabled = False

    def start(self):
        """TODO: open the webcam (cv2.VideoCapture) and the pose model."""
        self.enabled = True

    def stop(self):
        """TODO: release the webcam / pose model."""
        self.enabled = False

    def get_jump(self) -> bool:
        """Return True on the frame a jump motion is detected."""
        return False

    def get_lean(self) -> str:
        """Return 'left', 'right', or 'center' based on body lean."""
        return "center"
