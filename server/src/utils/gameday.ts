interface GameDayConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  oauthEndpoint: string;
}

interface AuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
}

interface GameDayUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;
  membershipNumber?: string;
  status: string;
  registrations?: GameDayRegistration[];
}

interface GameDayTeam {
  id: string;
  name: string;
  shortName?: string;
  division?: string;
  grade?: string;
  ageGroup?: string;
  season: string;
  league: string;
  players?: GameDayUser[];
  coaches?: GameDayUser[];
  officials?: GameDayUser[];
}

interface GameDayRegistration {
  id: string;
  userId: string;
  teamId?: string;
  leagueId: string;
  seasonId: string;
  role: 'player' | 'coach' | 'official' | 'volunteer';
  status: 'active' | 'inactive' | 'pending';
}

interface GameDayLeague {
  id: string;
  name: string;
  sport: string;
  organization: string;
  seasons: GameDaySeason[];
}

interface GameDaySeason {
  id: string;
  name: string;
  year: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed' | 'upcoming';
}

interface ApiResponse<T> {
  data: T;
  pagination?: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalRecords: number;
  };
  success: boolean;
  message?: string;
}

class GameDayApiClient {
  private config: GameDayConfig;
  private authToken: AuthToken | null = null;

  constructor(config: GameDayConfig) {
    this.config = config;
  }

  /**
   * Authenticate with OAuth 2.0 client credentials flow
   */
  private async authenticate(): Promise<void> {
    try {
      const response = await fetch(this.config.oauthEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
      }

      const tokenData = await response.json() as any;
      this.authToken = {
        access_token: tokenData.access_token,
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in,
        expires_at: Date.now() + (tokenData.expires_in * 1000),
      };
    } catch (error) {
      throw new Error(`Failed to authenticate: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if token is valid and refresh if needed
   */
  private async ensureValidToken(): Promise<void> {
    if (!this.authToken || Date.now() >= this.authToken.expires_at - 60000) { // Refresh 1 minute before expiry
      await this.authenticate();
    }
  }

  /**
   * Make authenticated API request
   */
  private async apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    await this.ensureValidToken();

    const url = `${this.config.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `${this.authToken!.token_type} ${this.authToken!.access_token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      return await response.json() as ApiResponse<T>;
    } catch (error) {
      throw new Error(`API request error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all users for a specific league and season
   */
  async getUsers(leagueId: string, seasonId: string, page: number = 1, pageSize: number = 100): Promise<ApiResponse<GameDayUser[]>> {
    const endpoint = `/api/v1/leagues/${leagueId}/seasons/${seasonId}/users?page=${page}&pageSize=${pageSize}`;
    return this.apiRequest<GameDayUser[]>(endpoint);
  }

  /**
   * Get all teams for a specific league and season
   */
  async getTeams(leagueId: string, seasonId: string, page: number = 1, pageSize: number = 100): Promise<ApiResponse<GameDayTeam[]>> {
    const endpoint = `/api/v1/leagues/${leagueId}/seasons/${seasonId}/teams?page=${page}&pageSize=${pageSize}`;
    return this.apiRequest<GameDayTeam[]>(endpoint);
  }

  /**
   * Get team members (players, coaches, officials) for a specific team
   */
  async getTeamMembers(teamId: string): Promise<ApiResponse<GameDayUser[]>> {
    const endpoint = `/api/v1/teams/${teamId}/members`;
    return this.apiRequest<GameDayUser[]>(endpoint);
  }

  /**
   * Get all registrations for a league and season
   */
  async getRegistrations(leagueId: string, seasonId: string, page: number = 1, pageSize: number = 100): Promise<ApiResponse<GameDayRegistration[]>> {
    const endpoint = `/api/v1/leagues/${leagueId}/seasons/${seasonId}/registrations?page=${page}&pageSize=${pageSize}`;
    return this.apiRequest<GameDayRegistration[]>(endpoint);
  }

  /**
   * Get available leagues
   */
  async getLeagues(): Promise<ApiResponse<GameDayLeague[]>> {
    const endpoint = '/api/v1/leagues';
    return this.apiRequest<GameDayLeague[]>(endpoint);
  }

  /**
   * Get seasons for a specific league
   */
  async getSeasons(leagueId: string): Promise<ApiResponse<GameDaySeason[]>> {
    const endpoint = `/api/v1/leagues/${leagueId}/seasons`;
    return this.apiRequest<GameDaySeason[]>(endpoint);
  }

  /**
   * Utility method to get all users and teams for a league/season in one call
   */
  async getLeagueData(leagueId: string, seasonId: string): Promise<{
    users: GameDayUser[];
    teams: GameDayTeam[];
    registrations: GameDayRegistration[];
  }> {
    try {
      const [usersResponse, teamsResponse, registrationsResponse] = await Promise.all([
        this.getAllPaginatedData(leagueId, seasonId, 'users'),
        this.getAllPaginatedData(leagueId, seasonId, 'teams'),
        this.getAllPaginatedData(leagueId, seasonId, 'registrations'),
      ]);

      return {
        users: usersResponse as GameDayUser[],
        teams: teamsResponse as GameDayTeam[],
        registrations: registrationsResponse as GameDayRegistration[],
      };
    } catch (error) {
      throw new Error(`Failed to get league data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Helper method to get all paginated data
   */
  private async getAllPaginatedData(
    leagueId: string, 
    seasonId: string, 
    dataType: 'users' | 'teams' | 'registrations'
  ): Promise<GameDayUser[] | GameDayTeam[] | GameDayRegistration[]> {
    const allData: any[] = [];
    let page = 1;
    let hasMoreData = true;

    while (hasMoreData) {
      let response: ApiResponse<any[]>;
      
      switch (dataType) {
        case 'users':
          response = await this.getUsers(leagueId, seasonId, page);
          break;
        case 'teams':
          response = await this.getTeams(leagueId, seasonId, page);
          break;
        case 'registrations':
          response = await this.getRegistrations(leagueId, seasonId, page);
          break;
      }

      allData.push(...response.data);

      if (response.pagination) {
        hasMoreData = page < response.pagination.totalPages;
        page++;
      } else {
        hasMoreData = false;
      }

      // Add a small delay to avoid rate limiting
      if (hasMoreData) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return allData;
  }
}

export { GameDayApiClient, type GameDayConfig, type GameDayUser, type GameDayTeam, type GameDayRegistration };