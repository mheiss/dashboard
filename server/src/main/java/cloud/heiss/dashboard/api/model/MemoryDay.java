package cloud.heiss.dashboard.api.model;

import java.util.List;

/** Up to three anniversary photos from distinct past years for a calendar day. */
public record MemoryDay(int month, int day, List<Image> images) {

    public MemoryDay {
        images = List.copyOf(images);
    }
}