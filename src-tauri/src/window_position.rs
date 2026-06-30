#[derive(Debug, Clone, Copy)]
pub struct WindowPoint {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Copy)]
pub struct WindowSize {
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Copy)]
struct WorkArea {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

impl WorkArea {
    fn width(self) -> i32 {
        self.right - self.left
    }

    fn height(self) -> i32 {
        self.bottom - self.top
    }
}

pub struct WindowPositionService;

impl WindowPositionService {
    const EDGE_PADDING: i32 = 8;

    pub fn default_position(window_size: WindowSize) -> WindowPoint {
        let area = Self::primary_work_area();
        let right_half_center_x = area.left + area.width() * 3 / 4;
        let preferred = WindowPoint {
            x: right_half_center_x - window_size.width / 2,
            y: area.top + (area.height() - window_size.height) / 2,
        };
        Self::clamp_to_work_area(preferred, window_size, area)
    }

    #[cfg(windows)]
    pub fn set_window_position_native(hwnd: isize, point: WindowPoint) -> bool {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER,
        };

        unsafe {
            SetWindowPos(
                HWND(hwnd as *mut _),
                HWND(std::ptr::null_mut()),
                point.x,
                point.y,
                0,
                0,
                SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOSIZE,
            )
            .is_ok()
        }
    }

    #[cfg(not(windows))]
    pub fn set_window_position_native(_hwnd: isize, _point: WindowPoint) -> bool {
        false
    }

    fn clamp_to_work_area(
        point: WindowPoint,
        window_size: WindowSize,
        area: WorkArea,
    ) -> WindowPoint {
        let (min_x, max_x) = Self::axis_bounds(area.left, area.right, window_size.width);
        let (min_y, max_y) = Self::axis_bounds(area.top, area.bottom, window_size.height);

        WindowPoint {
            x: point.x.clamp(min_x, max_x),
            y: point.y.clamp(min_y, max_y),
        }
    }

    fn axis_bounds(start: i32, end: i32, length: i32) -> (i32, i32) {
        let padded_min = start + Self::EDGE_PADDING;
        let padded_max = end - length - Self::EDGE_PADDING;
        if padded_max >= padded_min {
            return (padded_min, padded_max);
        }

        let max = end - length;
        if max >= start {
            (start, max)
        } else {
            (start, start)
        }
    }

    #[cfg(windows)]
    fn primary_work_area() -> WorkArea {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::Graphics::Gdi::{MonitorFromPoint, MONITOR_DEFAULTTOPRIMARY};

        unsafe {
            let monitor = MonitorFromPoint(POINT { x: 0, y: 0 }, MONITOR_DEFAULTTOPRIMARY);
            Self::monitor_work_area(monitor).unwrap_or_else(Self::fallback_work_area)
        }
    }

    #[cfg(not(windows))]
    fn primary_work_area() -> WorkArea {
        Self::fallback_work_area()
    }

    #[cfg(windows)]
    fn monitor_work_area(monitor: windows::Win32::Graphics::Gdi::HMONITOR) -> Option<WorkArea> {
        use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MONITORINFO};

        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };

        if unsafe { GetMonitorInfoW(monitor, &mut info).as_bool() } {
            let rc = info.rcWork;
            Some(WorkArea {
                left: rc.left,
                top: rc.top,
                right: rc.right,
                bottom: rc.bottom,
            })
        } else {
            None
        }
    }

    fn fallback_work_area() -> WorkArea {
        WorkArea {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
        }
    }
}
