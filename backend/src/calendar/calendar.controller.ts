import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { RoleName } from "@prisma/client";
import { Roles } from "../common/decorators/roles.decorator";
import { CalendarService } from "./calendar.service";
import { CalendarSettingsDto, HolidayDto } from "./dto/calendar.dto";

@Controller("calendar")
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get("settings")
  settings() {
    return this.calendarService.settings();
  }

  @Get("holidays")
  holidays(@Query("year") year: string) {
    return this.calendarService.listHolidays(
      Number(year) || new Date().getFullYear(),
    );
  }

  @Get("summary")
  summary(@Query("month") month: string, @Query("year") year: string) {
    const now = new Date();
    return this.calendarService.workingDaySummary(
      Number(month) || now.getMonth() + 1,
      Number(year) || now.getFullYear(),
    );
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch("settings")
  updateSettings(@Body() dto: CalendarSettingsDto) {
    return this.calendarService.updateSettings(dto);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Post("holidays")
  createHoliday(@Body() dto: HolidayDto) {
    return this.calendarService.createHoliday(dto);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Patch("holidays/:id")
  updateHoliday(@Param("id") id: string, @Body() dto: HolidayDto) {
    return this.calendarService.updateHoliday(id, dto);
  }

  @Roles(RoleName.HR_ADMIN, RoleName.SUPER_ADMIN)
  @Delete("holidays/:id")
  deleteHoliday(@Param("id") id: string) {
    return this.calendarService.deleteHoliday(id);
  }
}
