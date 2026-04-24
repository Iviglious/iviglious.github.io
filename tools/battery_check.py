"""
Battery Monitor Script
Checks battery level every 5 minutes and plays an alarm if below 50%.
Runs on Windows.
"""

import psutil
import time
import winsound
import sys
import argparse
from datetime import datetime
from pathlib import Path


def get_battery_level():
    """Get current battery percentage."""
    try:
        battery = psutil.sensors_battery()
        return battery.percent if battery else None
    except Exception as e:
        print(f"Error reading battery: {e}")
        return None


def play_alarm(times=5):
    """
    Play a Windows system alarm sound.
    
    Args:
        times: Number of times to play (default: 2)
    """
    # Try to find Windows system alarm sounds
    sound_files = [
        Path("C:/Windows/Media/Ring03.wav"),
        Path("C:/Windows/Media/Windows Critical Stop.wav"),
        Path("C:/Windows/Media/Critical Battery Alarm.wav"),
    ]
    
    sound_file = None
    for file in sound_files:
        if file.exists():
            sound_file = str(file)
            break
    
    if sound_file:
        for i in range(times):
            try:
                winsound.PlaySound(sound_file, winsound.SND_FILENAME | winsound.SND_NODEFAULT)
                if i < times - 1:
                    time.sleep(1)
            except Exception as e:
                print(f"  Error playing sound: {e}")
                break
    else:
        print("  Warning: No system alarm WAV file found")


def battery_monitor(threshold=50, check_interval=300):
    """
    Monitor battery level and play alarm when below threshold.
    
    Args:
        threshold: Battery percentage threshold (default: 50%)
        check_interval: Check interval in seconds (default: 300 = 5 minutes)
    """
    print(f"Battery Monitor Started")
    print(f"Threshold: {threshold}%")
    print(f"Check interval: {check_interval} seconds ({check_interval/60:.1f} minutes)")
    print(f"Press Ctrl+C to stop\n")
    
    alarm_triggered = False
    
    try:
        while True:
            battery_level = get_battery_level()
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            if battery_level is not None:
                print(f"[{timestamp}] Battery: {battery_level}%")
                
                if battery_level < threshold:
                    print(f"⚠️  ALARM! Battery is below {threshold}%!")
                    play_alarm()
            else:
                print(f"[{timestamp}] Could not read battery level")
            
            time.sleep(check_interval)
            
    except KeyboardInterrupt:
        print("\n\nBattery Monitor Stopped")
        sys.exit(0)


if __name__ == "__main__":
    # Check if psutil is installed
    try:
        import psutil
    except ImportError:
        print("Error: psutil is not installed.")
        print("Install it with: pip install psutil")
        sys.exit(1)
    
    # Parse command-line arguments
    parser = argparse.ArgumentParser(
        description="Monitor battery level and play an alarm if below threshold."
    )
    parser.add_argument(
        "--threshold",
        type=int,
        default=10,
        help="Battery percentage threshold for alarm (default: 10)"
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=300,
        help="Check interval in seconds (default: 300 = 5 minutes)"
    )
    
    args = parser.parse_args()
    
    # Run the battery monitor with parsed arguments
    battery_monitor(threshold=args.threshold, check_interval=args.interval)
