package cloud.heiss.dashboard.api.model;

import java.util.List;

/** Anniversary photo group matching a reference month and day across other years. */
public record Moment(String date, List<Image> images) {

    public Moment {
        images = List.copyOf(images);
    }
}